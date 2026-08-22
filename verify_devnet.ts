import { Connection, PublicKey } from "@solana/web3.js";

const REGISTRATION_PROGRAM_ID = new PublicKey("TRBZyQHB3m68FGeVsqTK39Wm4xejadjVhP5MAZaKWDM");
const CANDIDATE_PROGRAM_ID = new PublicKey("2ABywX9CqYpD97JWK6r9D9V4YXok7MY21vaxQddkvSB1");
const USER_WALLET = new PublicKey("FQtMrhPXc6taxXPvMZGjqUDKuDwneBZZX4XdCFFtALWp");

const RPC_URL = "https://api.devnet.solana.com";

async function verify() {
  console.log("================================================================");
  console.log("TURBIN3 PREREQUISITE CHALLENGE - VERIFICATION AUDIT");
  console.log("================================================================");

  const connection = new Connection(RPC_URL, "confirmed");

  // Step 1: Check Custom Program Deployment
  console.log("--- 1. Custom Program Status on Devnet ---");
  const programAccount = await connection.getAccountInfo(CANDIDATE_PROGRAM_ID);
  console.log(`Program ID:  ${CANDIDATE_PROGRAM_ID.toBase58()}`);
  console.log(`Deployed:    ${Boolean(programAccount)}`);
  console.log(`Executable:  ${programAccount?.executable}`);
  console.log(`Data Size:   ${programAccount?.data.length} bytes`);

  // Step 2: Check Transactions and CPI Logs
  console.log("\n--- 2. Inspecting Recent Transaction Logs on Custom Program ---");
  const signatures = await connection.getSignaturesForAddress(CANDIDATE_PROGRAM_ID, { limit: 10 });
  console.log(`Total transactions found: ${signatures.length}`);

  let foundWithdrawCpi = false;
  for (const sigInfo of signatures) {
    console.log(`\nTransaction: ${sigInfo.signature}`);
    const tx = await connection.getParsedTransaction(sigInfo.signature, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    });

    const logs = tx?.meta?.logMessages || [];
    logs.forEach((l) => console.log(`  > ${l}`));

    if (logs.some((l) => l.includes(`Program ${REGISTRATION_PROGRAM_ID.toBase58()} invoke`)) &&
        logs.some((l) => l.includes(`Program ${REGISTRATION_PROGRAM_ID.toBase58()} success`))) {
      foundWithdrawCpi = true;
    }
  }

  // Step 3: Check Registration PDA
  console.log("\n--- 3. Checking Turbin3 Registration Account State ---");
  const [expectedPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("prereqs"), USER_WALLET.toBuffer()],
    REGISTRATION_PROGRAM_ID
  );
  console.log(`Registration PDA Address: ${expectedPda.toBase58()}`);

  const pdaAccount = await connection.getAccountInfo(expectedPda);
  if (!pdaAccount) {
    console.log("❌ Registration PDA not found on devnet!");
  } else {
    const data = pdaAccount.data;
    const user = new PublicKey(data.slice(8, 40));
    const bump = data[40];
    const pre_req_ts = data[41] === 1;
    const pre_req_rs = data[42] === 1;
    const strLen = data.readUInt32LE(43);
    const github = data.slice(47, 47 + strLen).toString("utf8");

    console.log("✅ On-Chain Registration Account Found:");
    console.log(`   - User:       ${user.toBase58()}`);
    console.log(`   - Bump:       ${bump}`);
    console.log(`   - pre_req_ts: ${pre_req_ts}`);
    console.log(`   - pre_req_rs: ${pre_req_rs}`);
    console.log(`   - GitHub:     "${github}"`);
  }

  console.log("\n================================================================");
  console.log("FINAL AUDIT SUMMARY");
  console.log("================================================================");
  console.log(`1. Custom Program Deployed to Devnet:  ${Boolean(programAccount) ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`2. CPI Invocation Verified in Logs:    ${foundWithdrawCpi ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`3. Registration PDA Exists On-Chain:   ${Boolean(pdaAccount) ? "✅ PASS" : "❌ FAIL"}`);
  console.log("================================================================\n");
}

verify().catch(console.error);
