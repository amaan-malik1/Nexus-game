import { PrismaClient, MissionType } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.gameConfig.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton", masterKey: "72941" },
  });

  await prisma.challenge.deleteMany({});
  await prisma.mission.deleteMany({});
  await prisma.techTeamMember.deleteMany({});

  // Tech team agent roster — edit real names + callsigns from the admin later
  const [crypto, protocol, archivist, locksmith, insider] = await Promise.all([
    prisma.techTeamMember.create({ data: { name: "TBD", role: "Crypto Agent",     agentCallsign: "CRYPTO AGENT",     order: 1, bio: "Speaks in patterns. Every word is a puzzle waiting to be solved." } }),
    prisma.techTeamMember.create({ data: { name: "TBD", role: "Protocol Handler", agentCallsign: "PROTOCOL HANDLER", order: 2, bio: "Structure first, feelings later. Every process must be followed." } }),
    prisma.techTeamMember.create({ data: { name: "TBD", role: "Data Archivist",   agentCallsign: "DATA ARCHIVIST",   order: 3, bio: "Knows what happened, when it happened, and who was there." } }),
    prisma.techTeamMember.create({ data: { name: "TBD", role: "Locksmith",        agentCallsign: "LOCKSMITH",        order: 4, bio: "Thinks in loops. Solves what the rest of us miss." } }),
    prisma.techTeamMember.create({ data: { name: "TBD", role: "The Insider",      agentCallsign: "THE INSIDER",      order: 5, bio: "Everywhere and nowhere. Match every trait or don't bother." } }),
  ]);

  // ============================================================
  // MISSION 1 · CRACK THE CIPHER (Caesar +3, 2 steps)
  // ============================================================
  const m1 = await prisma.mission.create({
    data: {
      orderIndex: 1,
      title: "CRACK THE CIPHER",
      type: MissionType.CIPHER,
      description: "Decode the encrypted greeting, then hunt the Crypto Agent.",
      briefingText:
        "> INCOMING TRANSMISSION\n> ENCRYPTION: CAESAR SHIFT +3\n> DECODE TO PROCEED.",
      agentAppearance:
        "Kabhi khaali haath nahi milenge. Ek cheez hamesha grip mein rehti hai — steam nikalti hui.",
      agentAbout:
        "Words ke saath khelte rehte hain — har baat mein ek chhupa hua pattern. Baat karo, aap khud pakadenge unka rhythm.",
      agentLocation:
        "Wahaan honge jahaan discussion sabse zyada garam hai. Cup aur crowd — dono ke beech mein.",
      agentMemberId: crypto.id,
    },
  });
  await prisma.challenge.create({
    data: {
      missionId: m1.id,
      orderInMission: 1,
      questionText: "Decode karo bacchon — kya haal chaal.",
      questionData: {
        cipherText: "KHOOR EDFFKR",
        hintClue: "A → D · shift har letter 3 forward",
      },
      answer: "HELLO BACCHO",
      points: 50,
      fragmentValue: 7,
      hintCost: 30,
      hintText: "Caesar shift +3. KHOOR = HELLO. Spaces intact.",
    },
  });

  // ============================================================
  // MISSION 2 · DEAD PROTOCOL (symbol → letter)
  // ============================================================
  const m2 = await prisma.mission.create({
    data: {
      orderIndex: 2,
      title: "DEAD PROTOCOL",
      type: MissionType.PROTOCOL,
      description: "Symbols ko decode karo. Legend dhyaan se padho.",
      briefingText:
        "> LEGACY PROTOCOL DETECTED\n> SYMBOLS MAP TO LETTERS\n> DECODE THE KEYWORD.",
      agentAppearance:
        "Fingers rest mein bhi type karte hain — koi imaginary keyboard baja rahe hote hain. Notice karke pehchan jaoge.",
      agentAbout:
        "Har cheez ke liye ek specific process hai inke paas. Improvisation? Never. Rules? Always.",
      agentLocation:
        "Wahaan honge jahaan tech setup zaroori hai — mic, cable, sound. Setup ke bina reh nahi sakte.",
      agentMemberId: protocol.id,
    },
  });
  await prisma.challenge.create({
    data: {
      missionId: m2.id,
      orderInMission: 1,
      questionText: "Legend use karo, symbols decode karo. 4 letters ka ek desi shabd banega.",
      questionData: {
        legend: { "⌘": "C", "♪": "H", "☯": "A", "☕": "I", "⚡": "T", "✧": "E" },
        encoded: "⌘ ♪ ☯ ☕",
        directions: { C: "Chalo", H: "Halke se", A: "Aage", I: "Ittemenaan" },
      },
      answer: "CHAI",
      points: 50,
      fragmentValue: 2,
      hintCost: 30,
      hintText: "Sirf pehle 4 symbols dekho. Legend mein har ek ka letter likha hai.",
    },
  });

  // ============================================================
  // MISSION 3 · CORRUPTED DATA (find the odd line)
  // ============================================================
  const m3 = await prisma.mission.create({
    data: {
      orderIndex: 3,
      title: "CORRUPTED DATA",
      type: MissionType.DATA_CORRUPTION,
      description: "Enrollment list leak ho gayi. Ek ID mein ek character ne bhes badla hai.",
      briefingText:
        "> ENROLLMENT LEDGER LEAKED\n> ONE ENTRY IS A FORGERY\n> IDENTIFY THE LINE NUMBER.",
      agentAppearance:
        "Chalte-firte ledger. Kuch bhi poocho — likhne ki tayaari mein rehte hain. Khaali haath rare hai.",
      agentAbout:
        "Har team ka status inhe pata hai. Kaun kahaan, kaun kya kar raha — sab data brain mein loaded rehta hai.",
      agentLocation:
        "Wahaan baithe honge jahaan se pura hall dikhta hai — front nahi, jahaan se sab observe ho sake.",
      agentMemberId: archivist.id,
    },
  });
  await prisma.challenge.create({
    data: {
      missionId: m3.id,
      orderInMission: 1,
      questionText: "Kaunsi line mein ID ne bhes badla hai? Line number likho.",
      questionData: {
        entries: [
          "NEXUS_2026_A","NEXUS_2026_A","NEXUS_2026_A",
          "NEXUS_2026_A","NEXUS_2026_A","NEXUS_2026_A",
          "NEXUS_2O26_A","NEXUS_2026_A","NEXUS_2026_A",
          "NEXUS_2026_A","NEXUS_2026_A","NEXUS_2026_A",
          "NEXUS_2026_A","NEXUS_2026_A","NEXUS_2026_A",
        ],
      },
      answer: "7",
      points: 50,
      fragmentValue: 9,
      hintCost: 30,
      hintText:
        "Zero (0) aur letter O — dono dikhne mein same, matlab alag. Line 5-10 ke beech dekho.",
    },
  });

  // ============================================================
  // MISSION 4 · THE DIGITAL LOCK (3-digit mastermind)
  // ============================================================
  const m4 = await prisma.mission.create({
    data: {
      orderIndex: 4,
      title: "THE DIGITAL LOCK",
      type: MissionType.LOGIC_LOCK,
      description: "3-digit lock hai. Clues use karo, elimination logic lagao.",
      briefingText:
        "> VAULT SUBSYSTEM LOCKED\n> DEDUCE THE COMBINATION\n> HAR CLUE DHYAAN SE PADHO.",
      agentAppearance:
        "Sound se allergy hai. Kaan hamesha bhare rehte hain — chahe music baj raha ho ya nahi, coverage full.",
      agentAbout:
        "Har puzzle solve karne mein satisfaction milta hai. Bolne se pehle sochte hain — 2-3 baar.",
      agentLocation:
        "Bheed se door. Jahaan koi nahi hai, wahin ye milenge — solo mode is default mode.",
      agentMemberId: locksmith.id,
    },
  });
  await prisma.challenge.create({
    data: {
      missionId: m4.id,
      orderInMission: 1,
      questionText: "3-digit lock crack karo. 5 clues neeche — elimination lagao.",
      questionData: {
        clues: [
          { code: "682", hint: "One digit correct AND correctly placed" },
          { code: "614", hint: "One digit correct but wrongly placed" },
          { code: "206", hint: "Two digits correct but both wrongly placed" },
          { code: "738", hint: "Nothing correct" },
          { code: "780", hint: "One digit correct but wrongly placed" },
        ],
      },
      answer: "042",
      points: 50,
      fragmentValue: 4,
      hintCost: 30,
      hintText:
        "Clue 738 se shuru karo — 7, 3, 8 answer mein NAHI hain. Baaki elimination.",
    },
  });

  // ============================================================
  // MISSION 5 · FIND THE INSIDER (no phone puzzle — pure hunt)
  // ============================================================
  const m5 = await prisma.mission.create({
    data: {
      orderIndex: 5,
      title: "FIND THE INSIDER",
      type: MissionType.INSIDER,
      description:
        "Insider ek hi hai. Har trait match hone chahiye — 4/5 nahi, PAANCH ke paanch.",
      briefingText:
        "> INSIDER IDENTIFIED IN THE CROWD\n> ALL FIVE TRAITS MUST MATCH\n> GO. FIND. VERIFY.",
      agentClueText:
        "Insider chhupa hua hai crowd mein. Alag se identify nahi hoga — sab traits ka combo maango.\n" +
        "Woh CENTER STAGE ke aas-paas ghoomta rahega, ek printed 'STAFF' badge nahi pehnega — deliberately.\n" +
        "Blue jeans, jo bhi upar ho, aur ek small notebook haath mein. Chai cup optional.\n" +
        "Har trait poocho. Sab paanch match hote hi — Fragment 5 mile jayega.",
      agentAppearance:
        "Bilkul jaise koi bhi doosra senior — koi giveaway nahi. Ye trap bhi hai aur test bhi.",
      agentAbout:
        "5 traits. Sab ke sab match hone chahiye. 4/5 aur 5/5 mein zameen-aasman ka farak hai.",
      agentLocation:
        "Fixed jagah nahi. Ye khud aage nahi aayenge — aap hi dhoondhna hai. Har senior se poocho, har trait verify karo.",
      agentMemberId: insider.id,
    },
  });
  await prisma.challenge.create({
    data: {
      missionId: m5.id,
      orderInMission: 1,
      questionText: "Har trait match kariye. All 5 hone chahiye — 4/5 = NOT the one.",
      questionData: {
        traits: [
          "Chai over coffee — always",
          "Has stayed up till 3 AM debugging",
          "Fluent in Python AND Hindi memes",
          "Has fixed someone else's laptop for free",
          "Owns 3+ tech-event T-shirts",
        ],
      },
      answer: null,
      points: 50,
      fragmentValue: 1,
      hintCost: 30,
      hintText:
        "Har senior se ek-ek karke poocho. All 5 match = INSIDER. Even 4/5 = NOT the one.",
    },
  });

  // ============================================================
  // ALTERNATE BANK (kept for reference — swap in via admin if desired)
  // ============================================================
  const alt = await prisma.mission.upsert({
    where: { orderIndex: 99 },
    update: {},
    create: {
      orderIndex: 99,
      title: "ALTERNATE BANK",
      type: MissionType.CIPHER,
      description: "Swap-in pool the admin can promote into live missions.",
      briefingText: "(alternate bank)",
      isActive: false,
    },
  });

  console.log("✅ Seed complete.");
  console.log("   Master key = 72941");
  console.log("   Scoring: correct answer +50 · correct fragment +50 · wrong answer -20 · hint -30");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
