import { THREE } from '../three.js';
import { createCelMaterial, ensureFlatNormalAttribute } from '../graphics/materials.js';
import { createLowPolyLathe, HEX_RING, HEAD_PROFILE } from '../characters/geometry.js';

export function buildPlaza(worldPropsGroup, mats) {
  const box = ensureFlatNormalAttribute(new THREE.BoxGeometry(1, 1, 1), true);
  const round = ensureFlatNormalAttribute(new THREE.SphereGeometry(1, 10, 6), true);
  const ink = createCelMaterial('#44424a', '#292831', '#171720');
  const dinoSkin = createCelMaterial('#F5F2EA', '#D5D1CE', '#ADA7AD');
  const mouthMat = createCelMaterial('#655453', '#4c3b41', '#33262f');
  const wood = createCelMaterial('#D2A77C', '#AF805E', '#8E644D');
  const cream = createCelMaterial('#FFFAE9', '#F1DBC3', '#D0AA89');
  const dough = createCelMaterial('#F2C87E', '#DDA464', '#B17B50');
  const screenMat = createCelMaterial('#9ECFEC', '#6CA5C9', '#577CA5');

  function part(group, geometry, material, x, y, z) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  }

  function scaled(group, geometry, material, x, y, z, sx, sy, sz) {
    const mesh = part(group, geometry, material, x, y, z);
    mesh.scale.set(sx, sy, sz);
    return mesh;
  }

  const bench = new THREE.Group();
  bench.position.set(-3.5, 0, -6.45);
  worldPropsGroup.add(bench);
  const benchFurniture = new THREE.Group();
  benchFurniture.scale.set(1.65, 1.2, 2);
  bench.add(benchFurniture);
  for (const side of [-1, 1]) {
    scaled(benchFurniture, box, wood, side * 1.04, .27, -.03, .16, .54, .73);
    scaled(benchFurniture, box, wood, side * 1.04, .83, -.42, .14, .75, .13);
  }
  scaled(benchFurniture, box, wood, 0, .56, 0, 2.53, .13, .92);
  for (const height of [.85, 1.08]) {
    scaled(benchFurniture, box, wood, 0, height, -.42, 2.53, .16, .12);
  }

  // HNF資料とKakao第3弾の輪郭を立体化。白っぽい体、長い鼻先、段になった歯。
  const resident = new THREE.Group();
  resident.position.set(0, .75, .08);
  // HNFの集合絵では、頭の横幅はガナディの耳を含む幅のおよそ2倍。
  resident.scale.setScalar(2.45);
  bench.add(resident);
  scaled(resident, round, dinoSkin, 0, .52, -.06, .58, .64, .52);
  const arms = [];
  for (const side of [-1, 1]) {
    const thigh = scaled(resident, round, dinoSkin, side * .36, .16, .32, .26, .26, .44);
    thigh.rotation.y = side * .23;
    scaled(resident, round, dinoSkin, side * .43, -.10, .59, .22, .19, .33);
    const arm = scaled(resident, round, dinoSkin, side * .36, .74, .44, .17, .14, .29);
    arm.rotation.y = -side * .56;
    arms.push(arm);
  }
  const tail = createLowPolyLathe([
    { y: 0, sx: 1, sz: 1 },
    { y: 6, sx: .76, sz: .72 },
    { y: 13, sx: .49, sz: .43, zOff: 2.4 },
    { y: 20, sx: .22, sz: .21, zOff: 4.5 },
    { y: 23, sx: .04, sz: .04, zOff: 7.2 },
  ], HEX_RING, 6.4, 5.2);
  part(resident, tail, dinoSkin, .34, .28, -.21).rotation.set(.17, 0, -1.49);

  const phone = new THREE.Group();
  phone.position.set(0, .82, .68);
  phone.rotation.x = -1.10;
  scaled(phone, box, ink, 0, 0, 0, .25, .39, .042);
  scaled(phone, box, screenMat, 0, .008, -.024, .207, .31, .009);
  resident.add(phone);
  const heldPhone = phone.position.clone();
  const benchPhone = new THREE.Vector3(-.69, .027, .17);
  const raisedPhone = new THREE.Vector3(0, 1.06, .94);
  const lowerPhoneArm = reachArm(arms[0], new THREE.Vector3(-.34, .76, .39), new THREE.Vector3(-.62, .13, .21));
  const reachForCake = reachArm(arms[1], new THREE.Vector3(.34, .76, .39), new THREE.Vector3(.69, .17, .12));
  const raisePhoneArm = reachArm(arms[1], new THREE.Vector3(.34, .78, .41), new THREE.Vector3(.10, .97, .92));

  function reachArm(arm, shoulder, paw) {
    const rest = arm.position.clone();
    const restRotation = arm.quaternion.clone();
    const center = shoulder.clone().lerp(paw, .5);
    const direction = paw.clone().sub(shoulder);
    const length = direction.length() * .54;
    const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction.normalize());
    return (amount) => {
      arm.position.lerpVectors(rest, center, amount);
      arm.quaternion.copy(restRotation).slerp(rotation, amount);
      arm.scale.z = THREE.MathUtils.lerp(.29, length, amount);
    };
  }

  function poseResidentSnack(phoneDown, reach) {
    phone.position.lerpVectors(heldPhone, benchPhone, phoneDown);
    lowerPhoneArm(phoneDown);
    reachForCake(reach);
  }

  function poseResidentPhoto(amount) {
    phone.position.lerpVectors(heldPhone, raisedPhone, amount);
    phone.rotation.x = THREE.MathUtils.lerp(-1.36, -.43, amount);
    raisePhoneArm(amount);
  }

  const head = new THREE.Group();
  head.position.set(0, 1.32, -.01);
  resident.add(head);
  const headPerches = {};
  for (const [name, x, y] of [['solo', 0, .655], ['ganadi', -.32, .62], ['gonyani', .32, .62]]) {
    const perch = new THREE.Object3D();
    perch.position.set(x, y, -.075);
    head.add(perch);
    headPerches[name] = perch;
  }
  const skull = createLowPolyLathe([
    { y: -10, sx: .49, sz: .55 },
    { y: -7, sx: .75, sz: .79 },
    { y: -2, sx: .92, sz: 1, zOff: -.6 },
    { y: 4, sx: 1, sz: 1, zOff: -.9 },
    { y: 9, sx: .88, sz: .86, zOff: -.8 },
    { y: 11.9, sx: .72, sz: .65, zOff: -.9 },
    { y: 13.1, sx: .45, sz: .33, zOff: -.9 },
  ], HEAD_PROFILE, 11.8, 10.5);
  part(head, skull, dinoSkin, 0, 0, 0);
  scaled(head, round, mouthMat, 0, -.32, .61, .488, .24, .43);
  scaled(head, round, dinoSkin, 0, -.50, .51, .495, .185, .48);
  scaled(head, round, dinoSkin, 0, -.042, .59, .55, .29, .57);
  const toothGeo = ensureFlatNormalAttribute(new THREE.ConeGeometry(1, 1, 4), true);
  for (let index = -3; index <= 3; index++) {
    const curve = (index / 3) ** 2;
    const z = .996 - curve * .19;
    const top = scaled(head, toothGeo, mats.fur, index * .125, -.245 - curve * .018, z, .055, .165, .058);
    top.rotation.z = Math.PI + index * .045;
    scaled(head, toothGeo, mats.fur, index * .119, -.425 + curve * .012, z - .006, .043, .105, .043);
  }
  for (const side of [-1, 1]) {
    scaled(head, round, dinoSkin, side * .29, .445, .287, .228, .18, .21);
    const eye = scaled(head, round, ink, side * .28, .35, .466, .075, .06, .044);
    eye.rotation.y = side * .26;
    scaled(head, round, mats.fur, side * .28 - .017, .365, .508, .018, .018, .012);
    const brow = scaled(head, round, ink, side * .28, .465, .476, .095, .024, .037);
    brow.rotation.z = side * -.24;
    scaled(head, round, ink, side * .163, .097, 1.077, .044, .026, .025).rotation.z = side * -.25;
  }

  const snackTable = new THREE.Group();
  snackTable.position.set(.29, 0, -3.18);
  worldPropsGroup.add(snackTable);
  const tabletop = ensureFlatNormalAttribute(new THREE.CylinderGeometry(.94, .9, .14, 12), true);
  for (const [x, z] of [[-.53, -.48], [.53, -.48], [-.53, .48], [.53, .48]]) {
    scaled(snackTable, box, wood, x, .34, z, .15, .68, .15);
  }
  part(snackTable, tabletop, cream, 0, .74, 0);

  const cup = ensureFlatNormalAttribute(new THREE.CylinderGeometry(.168, .117, .16, 10), true);
  const plate = ensureFlatNormalAttribute(new THREE.CylinderGeometry(.24, .19, .035, 10), true);
  const berry = ensureFlatNormalAttribute(new THREE.IcosahedronGeometry(1, 0), true);
  function cupcake(group, x, y, z) {
    const dish = new THREE.Group();
    dish.position.set(x, y, z);
    group.add(dish);
    part(dish, plate, mats.bowlBlue, 0, .018, 0);
    const food = new THREE.Group();
    dish.add(food);
    part(food, cup, dough, 0, .112, 0);
    scaled(food, round, cream, 0, .22, 0, .165, .095, .165);
    scaled(food, round, cream, 0, .277, 0, .107, .078, .108);
    const topping = new THREE.Group();
    scaled(topping, berry, mats.roseRed, 0, .373, 0, .068, .096, .065).rotation.z = -.25;
    scaled(topping, round, mats.stemGreen, .02, .445, 0, .073, .018, .048);
    food.add(topping);
    return { dish, topping, food };
  }
  const center = cupcake(snackTable, 0, .81, .08);
  const left = cupcake(snackTable, -.49, .81, -.14);
  const right = cupcake(snackTable, .49, .81, -.14);
  const residentSnack = cupcake(bench, 1.72, .75, .36);
  const snackFood = { left: left.food, right: right.food, resident: residentSnack.food };
  return {
    bench, resident, head, headPerches, phone, snackTable, center,
    left: left.dish, right: right.dish, residentSnack: residentSnack.dish, snackFood, poseResidentSnack, poseResidentPhoto,
  };
}
