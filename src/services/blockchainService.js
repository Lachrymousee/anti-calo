const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// Load file ABI TicketNFT.json yang sudah kamu miliki
const abiPath = path.join(__dirname, '../../shared/abi/TicketNFT.json'); // Sesuaikan path foldermu
let contractABI = [];

try {
    const rawData = fs.readFileSync(abiPath, 'utf8');
    const parsed = JSON.parse(rawData);
    contractABI = parsed.abi;
} catch (error) {
    console.warn('File ABI belum ditemukan di path tersebut, pastikan path sudah benar.');
}

// Konfigurasi Provider (contoh menggunakan Sepolia Testnet atau RPC lokal Hardhat)
const RPC_URL = process.env.RPC_URL || 'https://rpc.sepolia.org';
const CONTRACT_ADDRESS = process.env.TICKET_NFT_ADDRESS || '0xYourContractAddressHere';

const provider = new ethers.JsonRpcProvider(RPC_URL);

// Inisialisasi Instance Contract untuk Read-Only
const getTicketContract = () => {
    if (contractABI.length === 0) throw new Error('ABI Contract kosong');
    return new ethers.Contract(CONTRACT_ADDRESS, contractABI, provider);
};

/**
 * Contoh Fungsi Read-Only On-Chain: Cek apakah address memiliki role tertentu di smart contract
 * Menggunakan fungsi bawaan AccessControl OpenZeppelin di contract: hasRole(bytes32 role, address account)
 */
const checkOnChainRole = async (roleName, walletAddress) => {
    try {
        const contract = getTicketContract();
        
        // Hasilkan bytes32 hash untuk role (misal: keccak256("ORGANIZER_ROLE"))
        let roleHash;
        if (roleName === 'ADMIN') {
            roleHash = await contract.DEFAULT_ADMIN_ROLE();
        } else if (roleName === 'ORGANIZER') {
            roleHash = await contract.ORGANIZER_ROLE();
        } else if (roleName === 'MARKETPLACE') {
            roleHash = await contract.MARKETPLACE_ROLE();
        } else {
            return false;
        }

        const hasIt = await contract.hasRole(roleHash, walletAddress);
        return hasIt;
    } catch (error) {
        console.error('Gagal mengecek role on-chain:', error);
        return false;
    }
};

module.exports = { getTicketContract, checkOnChainRole };