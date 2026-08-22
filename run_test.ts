import * as anchor from "@anchor-lang/core";
import { Program, AnchorProvider, Wallet } from "@anchor-lang/core";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import { BN } from "bn.js";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const IDL = require("./target/idl/pre_req_vault.json");

async function main() {
  console.log("================================================================");
  console.log("EXECUTING VAULT PROGRAM INSTRUCTIONS ON SOLANA DEVNET");
  console.log("================================================================");

  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const walletKeypairPath = path.join(os.homedir(), ".config/solana/id.json");
  const keypairData = JSON.parse(fs.readFileSync(walletKeypairPath, "utf-8"));
  const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
  const wallet = new Wallet(keypair);

  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const programId = new PublicKey("2ABywX9CqYpD97JWK6r9D9V4YXok7MY21vaxQddkvSB1");
  const program = new Program(IDL, provider);

  const user = wallet.publicKey;
  console.log(`User Wallet:    ${user.toBase58()}`);
  const balance = await connection.getBalance(user);
  console.log(`Wallet Balance: ${balance / LAMPORTS_PER_SOL} SOL`);

  // Derive PDAs
  const [vaultStatePda, stateBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("state"), user.toBuffer()],
    programId
  );
  const [vaultPda, vaultBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), vaultStatePda.toBuffer()],
    programId
  );

  const applicationProgram = new PublicKey("TRBZyQHB3m68FGeVsqTK39Wm4xejadjVhP5MAZaKWDM");
  const [applicationAccount] = PublicKey.findProgramAddressSync(
    [Buffer.from("prereqs"), user.toBuffer()],
    applicationProgram
  );

  console.log(`Program ID:     ${programId.toBase58()}`);
  console.log(`Vault State PDA:${vaultStatePda.toBase58()} (bump: ${stateBump})`);
  console.log(`Vault PDA:      ${vaultPda.toBase58()} (bump: ${vaultBump})`);
  console.log(`App Account PDA:${applicationAccount.toBase58()}`);

  const confirmTx = async (sig: string, name: string) => {
    console.log(`\n⏳ [${name}] Confirming tx: ${sig}`);
    const latestBlockhash = await connection.getLatestBlockhash();
    await connection.confirmTransaction(
      {
        signature: sig,
        ...latestBlockhash,
      },
      "confirmed"
    );
    console.log(`✅ [${name}] Confirmed! View on Solana Explorer:`);
    console.log(`   https://explorer.solana.com/tx/${sig}?cluster=devnet`);
  };

  // Step 1: Initialize Vault
  console.log("\n--- STEP 1: Initializing Vault ---");
  const vaultStateInfo = await connection.getAccountInfo(vaultStatePda);
  if (vaultStateInfo) {
    console.log("ℹ️ Vault state already initialized.");
  } else {
    const initTx = await program.methods
      .initialize()
      .accountsStrict({
        user: user,
        vaultState: vaultStatePda,
        vault: vaultPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    await confirmTx(initTx, "Initialize");
  }

  // Step 2: Deposit 0.1 SOL
  console.log("\n--- STEP 2: Depositing 0.1 SOL into Vault ---");
  const depositAmount = 0.1 * LAMPORTS_PER_SOL;
  const depositTx = await program.methods
    .deposit(new BN(depositAmount))
    .accountsStrict({
      user: user,
      vaultState: vaultStatePda,
      vault: vaultPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  await confirmTx(depositTx, "Deposit");

  // Step 3: Withdraw 0.05 SOL + CPI to Registration Program
  console.log("\n--- STEP 3: Withdrawing 0.05 SOL + Triggering CPI Registration ---");
  const withdrawAmount = 0.05 * LAMPORTS_PER_SOL;
  const withdrawTx = await program.methods
    .withdraw(new BN(withdrawAmount))
    .accountsStrict({
      user: user,
      vaultState: vaultStatePda,
      vault: vaultPda,
      systemProgram: SystemProgram.programId,
      applicationAccount,
      applicationProgram,
    })
    .rpc();
  await confirmTx(withdrawTx, "Withdraw + CPI");

  // Step 4: Close Vault
  console.log("\n--- STEP 4: Closing Vault & Reclaiming Rent ---");
  const closeTx = await program.methods
    .close()
    .accountsStrict({
      user: user,
      vaultState: vaultStatePda,
      vault: vaultPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  await confirmTx(closeTx, "Close");

  console.log("\n================================================================");
  console.log("ALL VAULT INSTRUCTIONS AND CPI REGISTRATION COMPLETED SUCCESSFULLY!");
  console.log("================================================================\n");
}

main().catch((err) => {
  console.error("Execution failed:", err);
});
