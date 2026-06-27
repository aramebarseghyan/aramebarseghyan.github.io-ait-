import * as CANNON from 'cannon-es'
import * as THREE  from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) })
world.broadphase = new CANNON.SAPBroadphase(world)
world.allowSleep  = false
world.defaultContactMaterial.friction    = 0
world.defaultContactMaterial.restitution = 0

const gnd = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() })
gnd.quaternion.setFromEuler(-Math.PI / 2, 0, 0)
world.addBody(gnd)

const CAR_SCALE = 1.0

export class Vehicle {
  readonly mesh: THREE.Group
  readonly body: CANNON.Body
  speed = 0

  private throttle = 0
  private steer    = 0
  private brake    = 0

  constructor(scene: THREE.Scene) {
    this.body = new CANNON.Body({ mass: 150, linearDamping: 0.05, angularDamping: 0.95 })
    this.body.addShape(new CANNON.Box(new CANNON.Vec3(1, 0.45, 2)))
    this.body.position.set(0, 0.45, 0)
    this.body.allowSleep = false
    world.addBody(this.body)

    this.mesh = new THREE.Group()
    scene.add(this.mesh)

    const placeholder = new THREE.Mesh(
      new THREE.BoxGeometry(2, 0.9, 4),
      new THREE.MeshStandardMaterial({ color: 0x2255aa }),
    )
    placeholder.castShadow = placeholder.receiveShadow = true
    this.mesh.add(placeholder)

    new GLTFLoader().load(
      '/ps1_bmw_m3_gts_nfs_the_run.glb',
      gltf => {
        const model = gltf.scene

        const rawBox    = new THREE.Box3().setFromObject(model)
        const rawSize   = new THREE.Vector3()
        const rawCenter = new THREE.Vector3()
        rawBox.getSize(rawSize)
        rawBox.getCenter(rawCenter)

        const autoScale = (4.0 / Math.max(rawSize.x, rawSize.y, rawSize.z)) * CAR_SCALE
        model.scale.setScalar(autoScale)

        // Rotate model so its front aligns with physics forward (+Z).
        // R_y(-90°) maps GLB's +X → world +Z.
        // If car still faces wrong way after this, change to +Math.PI / 2.
        model.rotation.y = Math.PI / 2

        // Centering swaps X/Z to match the +90° rotation
        model.position.x = -rawCenter.z * autoScale
        model.position.z =  rawCenter.x * autoScale
        model.position.y = -rawBox.min.y * autoScale - 0.45

        model.traverse(obj => {
          const m = obj as THREE.Mesh
          if (m.isMesh) { m.castShadow = true; m.receiveShadow = true }
        })

        this.mesh.remove(placeholder)
        this.mesh.add(model)
      },
      undefined,
      err => console.error('[sim] GLB failed:', err),
    )

    window.addEventListener('keydown', e => {
      if (e.code === 'KeyW' || e.code === 'ArrowUp')    this.throttle = 1
      if (e.code === 'KeyS' || e.code === 'ArrowDown')  this.brake    = 1
      if (e.code === 'KeyA' || e.code === 'ArrowLeft')  this.steer    =  1
      if (e.code === 'KeyD' || e.code === 'ArrowRight') this.steer    = -1
      if (e.code === 'KeyR') this._reset()
    })
    window.addEventListener('keyup', e => {
      if (e.code === 'KeyW' || e.code === 'ArrowUp')   this.throttle = 0
      if (e.code === 'KeyS' || e.code === 'ArrowDown') this.brake    = 0
      if (e.code === 'KeyA' || e.code === 'ArrowLeft' ||
          e.code === 'KeyD' || e.code === 'ArrowRight') this.steer   = 0
    })
  }

  private _reset(): void {
    this.body.position.set(0, 0.45, 0)
    this.body.velocity.setZero()
    this.body.angularVelocity.setZero()
    this.body.quaternion.set(0, 0, 0, 1)
    this.speed = 0
  }

  step(dt: number): void {
    const fwd = new CANNON.Vec3()
    this.body.quaternion.vmult(new CANNON.Vec3(0, 0, 1), fwd)

    const FORCE = 6000
    if (this.throttle)
      this.body.applyForce(new CANNON.Vec3(fwd.x * FORCE, 0, fwd.z * FORCE))
    if (this.brake)
      this.body.applyForce(new CANNON.Vec3(
        -this.body.velocity.x * 200, 0, -this.body.velocity.z * 200,
      ))

    world.step(1 / 60, dt, 3)

    const spd = fwd.dot(this.body.velocity)
    this.speed = spd

    const MAX = 22
    if (spd > MAX) {
      this.body.velocity.x = fwd.x * MAX
      this.body.velocity.z = fwd.z * MAX
    }

    const inv = new CANNON.Quaternion(
      -this.body.quaternion.x, -this.body.quaternion.y,
      -this.body.quaternion.z,  this.body.quaternion.w,
    )
    const lv = new CANNON.Vec3()
    inv.vmult(this.body.velocity, lv)
    lv.x *= 0.08
    this.body.quaternion.vmult(lv, this.body.velocity)

    const absSpd = Math.abs(spd)
    if (this.steer && absSpd > 0.2)
      this.body.angularVelocity.y = this.steer * Math.min(absSpd / 6, 1) * 2.0 * Math.sign(spd)
    else
      this.body.angularVelocity.y *= 0.7

    this.body.angularVelocity.x *= 0.05
    this.body.angularVelocity.z *= 0.05
  }

  sync(_dt: number): void {
    const p = this.body.position
    const q = this.body.quaternion
    this.mesh.position.set(p.x, p.y, p.z)
    this.mesh.quaternion.set(q.x, q.y, q.z, q.w)
  }
}

function loadCity(scene: THREE.Scene): void {
  new GLTFLoader().load(
    '/models/city.glb',
    gltf => {
      gltf.scene.traverse(obj => {
        const m = obj as THREE.Mesh
        if (m.isMesh) { m.castShadow = true; m.receiveShadow = true }
      })
      scene.add(gltf.scene)
    },
    undefined,
    () => {},
  )
}

export function setupPhysics(scene: THREE.Scene): Vehicle {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1000, 1000),
    new THREE.MeshStandardMaterial({ color: 0x4a5040, roughness: 0.95 }),
  )
  ground.rotation.x  = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  const grid = new THREE.GridHelper(200, 40, 0x666666, 0x444444)
  grid.position.y = 0.01
  scene.add(grid)

  loadCity(scene)
  return new Vehicle(scene)
}
