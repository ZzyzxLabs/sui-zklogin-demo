'use client'

import { useState } from 'react'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { generateRandomness, generateNonce } from '@mysten/sui/zklogin'

export default function ZkLoginPage() {
  const [results, setResults] = useState<(string | null)[]>(Array(6).fill(null))

  const steps = [
    "Step 1: Generate ephemeral key pair",
    "Step 2: Generate randomness and nonce",
    "Step 3: Get JWT from OAuth provider",
    "Step 4: Decode JWT claims",
    "Step 5: Derive zkLogin address",
    "Step 6: Sign transaction with zk proof"
  ]

  const runStep = async (stepIndex: number) => {
    switch (stepIndex) {
      case 0: {
        const { Ed25519Keypair } = await import('@mysten/sui/keypairs/ed25519')
        const keypair = new Ed25519Keypair()
        setResults(prev => {
          const newResults = [...prev]
          newResults[0] = `Public Key: ${keypair.getPublicKey().toBase64()}`
          return newResults
        })
        break
      }
      case 1: {
        const { generateRandomness, generateNonce } = await import('@mysten/sui/zklogin')
        const { Ed25519Keypair } = await import('@mysten/sui/keypairs/ed25519')
        const ephemeralKeyPair = new Ed25519Keypair()
        const randomness = generateRandomness()
        const maxEpoch = 12345 // Replace with actual
        const nonce = generateNonce(ephemeralKeyPair.getPublicKey(), maxEpoch, randomness)
        setResults(prev => {
          const newResults = [...prev]
          newResults[1] = `Randomness: ${randomness}\nNonce: ${nonce}`
          return newResults
        })
        break
      }
      case 2:
        setResults(prev => {
          const newResults = [...prev]
          newResults[2] = 'Redirect to OAuth provider to obtain a JWT token (e.g. Google Sign-In)'
          return newResults
        })
        break
      case 3:
        setResults(prev => {
          const newResults = [...prev]
          newResults[3] = 'Use a JWT parser to extract claims: sub, iss, aud'
          return newResults
        })
        break
      case 4:
        setResults(prev => {
          const newResults = [...prev]
          newResults[4] = 'Use claims + userSalt to deterministically derive zkLogin address'
          return newResults
        })
        break
      case 5:
        setResults(prev => {
          const newResults = [...prev]
          newResults[5] = 'Sign transaction using zk proof + ephemeral signature'
          return newResults
        })
        break
    }
  }

  return (
    <main className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">zkLogin Walkthrough</h1>

      <div className="space-y-6">
        {steps.map((step, index) => (
          <div key={index} className="border rounded p-4">
            <div className="flex justify-between items-center mb-2">
              <p className="font-medium">{step}</p>
              <button
                onClick={() => runStep(index)}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm"
              >
                Run Step {index + 1}
              </button>
            </div>
            {results[index] && (
              <pre className="mt-2 bg-gray-100 p-3 rounded whitespace-pre-wrap text-sm text-black">
                {results[index]}
              </pre>
            )}
          </div>
        ))}
      </div>
    </main>
  )
}
