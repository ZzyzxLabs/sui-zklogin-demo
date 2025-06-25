# Sui zkLogin Demo

A comprehensive demonstration of Sui's zkLogin functionality, allowing users to authenticate with Google OAuth and perform transactions without traditional private key management.

## 🚀 Features

- **Google OAuth Integration**: Seamless authentication using Google accounts
- **Ephemeral Key Generation**: Secure temporary key pairs for transaction signing
- **Zero-Knowledge Proofs**: Privacy-preserving transaction authentication
- **Balance Checking**: Real-time SUI balance display
- **Step-by-Step Process**: Clear demonstration of the zkLogin workflow
- **Modern UI**: Built with Next.js and Tailwind CSS

## 🛠️ Tech Stack

- **Frontend**: Next.js 14 with TypeScript
- **UI Components**: shadcn/ui with Tailwind CSS
- **Blockchain**: Sui SDK for zkLogin operations
- **Authentication**: Google OAuth 2.0
- **Package Manager**: npm

## 📋 Prerequisites

- Node.js 18+
- npm
- Google OAuth credentials
- Sui devnet access

## 🚀 Getting Started

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd sui-zklogin-demo
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env.local` file in the root directory:

   ```env
   NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id
   NEXT_PUBLIC_BASE_URL=http://localhost:3000
   ```

4. **Run the development server**

   ```bash
   npm run dev
   ```

5. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## 🔧 Project Structure

```
sui-zklogin-demo/
├── src/
│   ├── app/
│   │   ├── page.tsx          # Main zkLogin demo page
│   │   ├── types.ts          # TypeScript type definitions
│   │   ├── layout.tsx        # App layout
│   │   └── globals.css       # Global styles
│   ├── components/
│   │   └── ui/               # shadcn/ui components
│   └── lib/
│       └── utils.ts          # Utility functions
├── contract/
│   └── sources/
│       └── zzyzx_coin.move   # Custom SUI coin contract
└── public/                   # Static assets
```

## 📖 How It Works

The demo implements a 5-step zkLogin process:

1. **Generate Ephemeral Key Pair**: Creates temporary cryptographic keys
2. **OAuth Authentication**: Authenticates user with Google
3. **Address Derivation**: Generates zkLogin address from JWT and salt
4. **Zero-Knowledge Proof**: Creates privacy-preserving proof
5. **Transaction Signing**: Signs and executes transactions on Sui

## 🔐 Security Features

- **Ephemeral Keys**: Temporary keys that expire after a set epoch
- **Zero-Knowledge Proofs**: Proves authentication without revealing credentials
- **Session Management**: Secure storage of temporary data
- **Error Handling**: Comprehensive error management

## 🎯 Use Cases

- **Web3 Authentication**: Seamless blockchain access without private keys
- **DeFi Applications**: Secure transaction signing for DeFi protocols
- **Gaming**: Easy onboarding for blockchain games
- **Social Apps**: Social login for Web3 applications

## 📝 Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## 🌐 Deployment

The easiest way to deploy is using [Vercel](https://vercel.com):

1. Push your code to GitHub
2. Import the project to Vercel
3. Add environment variables
4. Deploy

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

## 🔗 Resources

- [Sui Documentation](https://docs.sui.io/)
- [zkLogin Guide](https://docs.sui.io/guides/developer/zklogin)
- [Next.js Documentation](https://nextjs.org/docs)
- [shadcn/ui Components](https://ui.shadcn.com/)
