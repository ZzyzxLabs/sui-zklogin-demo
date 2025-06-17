import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'

export const generateEphemeralKeyPair = async () => {
    const keypair = new Ed25519Keypair()
    return `Public Key: ${keypair.getPublicKey().toBase64()}`
} 