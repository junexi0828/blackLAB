import { useMemo, useRef } from 'react'
import * as THREE from 'three'

// Simple deterministic random
function seeded(s: number) {
  const x = Math.sin(s) * 10000
  return x - Math.floor(x)
}

function LowPolyTrees() {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const TREE_COUNT = 80

  const transforms = useMemo(() => {
    const dummy = new THREE.Object3D()
    const matrices = []
    const colors = []
    const palette = ['#4caf50', '#8bc34a', '#388e3c', '#cddc39']

    for (let i = 0; i < TREE_COUNT; i++) {
      // Scatter roughly around the campus, avoiding exact centers where buildings are
      const x = (seeded(i * 1.1) - 0.5) * 50
      const z = (seeded(i * 2.2) - 0.5) * 50
      
      const scale = 0.5 + seeded(i * 3.3) * 0.5
      dummy.position.set(x, 0, z)
      dummy.rotation.y = seeded(i * 4.4) * Math.PI
      dummy.scale.set(scale, scale * (1 + seeded(i * 5.5) * 0.5), scale)
      dummy.updateMatrix()
      matrices.push(dummy.matrix.clone())

      const col = new THREE.Color(palette[Math.floor(seeded(i * 6.6) * palette.length)])
      colors.push(col.r, col.g, col.b)
    }
    return { matrices, colors: new Float32Array(colors) }
  }, [])

  useMemo(() => {
    if (meshRef.current) {
      for (let i = 0; i < TREE_COUNT; i++) {
        meshRef.current.setMatrixAt(i, transforms.matrices[i])
      }
      meshRef.current.instanceMatrix.needsUpdate = true
    }
  }, [transforms])

  return (
    <group>
      {/* Tree Leaves */}
      <instancedMesh ref={meshRef} args={[undefined, undefined, TREE_COUNT]} castShadow receiveShadow>
        <coneGeometry args={[0.6, 1.5, 5]} />
        <meshStandardMaterial roughness={0.9} vertexColors />
        <instancedBufferAttribute attach="attributes-color" args={[transforms.colors, 3]} />
      </instancedMesh>
    </group>
  )
}

export function GroundGrid({ timeTheme = 'day', lowPower = false }: { timeTheme?: 'day' | 'night'; lowPower?: boolean }) {
  const isNight = timeTheme === 'night'

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.01, 0]}>
        <planeGeometry args={[100, 100]} />
        <meshStandardMaterial color={isNight ? '#0d1825' : '#f8fafc'} roughness={0.1} metalness={0.1} />
      </mesh>
      
      <gridHelper args={[100, 50, isNight ? '#223245' : '#e2e8f0', isNight ? '#152231' : '#f1f5f9']} position={[0, 0, 0]} />

      {!lowPower && <LowPolyTrees />}
    </group>
  )
}
