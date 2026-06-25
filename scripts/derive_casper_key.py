#!/usr/bin/env python3
"""Derive a Casper secp256k1 account from a BIP39 mnemonic at m/44'/506'/0'/0/0.
Writes a SEC1 PEM secret key for casper-client and prints ONLY the public key /
account hash (never the secret)."""
import sys
from bip_utils import Bip39SeedGenerator, Bip32Slip10Secp256k1
from ecdsa import SigningKey, SECP256k1
import hashlib

mnemonic = open(sys.argv[1]).read().strip()
out_pem = sys.argv[2]

seed = Bip39SeedGenerator(mnemonic).Generate()
# Casper Wallet default: secp256k1, m/44'/506'/0'/0/0
node = Bip32Slip10Secp256k1.FromSeed(seed).DerivePath("m/44'/506'/0'/0/0")
priv_bytes = node.PrivateKey().Raw().ToBytes()

sk = SigningKey.from_string(priv_bytes, curve=SECP256k1)
with open(out_pem, "w") as f:
    f.write(sk.to_pem().decode())

# Compressed pubkey (33 bytes, 02/03 prefix)
vk = sk.get_verifying_key()
x = vk.pubkey.point.x()
y = vk.pubkey.point.y()
prefix = b"\x02" if y % 2 == 0 else b"\x03"
comp = prefix + x.to_bytes(32, "big")

# Casper public key hex = "02" (secp256k1 tag) + compressed pubkey
casper_pubkey = "02" + comp.hex()

# Account hash: blake2b256( lowercase_algo + 0x00 + pubkey_bytes )
algo = b"secp256k1"
h = hashlib.blake2b(digest_size=32)
h.update(algo + b"\x00" + comp)
account_hash = h.hexdigest()

print("CASPER_PUBLIC_KEY=" + casper_pubkey)
print("ACCOUNT_HASH=account-hash-" + account_hash)
