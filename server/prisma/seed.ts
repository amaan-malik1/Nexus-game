import { PrismaClient, MissionType } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Game config singleton
  await prisma.gameConfig.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton", masterKey: "72941" },
  });

  // Wipe missions to keep seed idempotent
  await prisma.challenge.deleteMany({});
  await prisma.mission.deleteMany({});
  await prisma.techTeamMember.deleteMany({});

  // Tech team agent roster (edit callsigns/bios in admin)
  const [crypto, protocol, archivist, locksmith, insider] = await Promise.all([
    prisma.techTeamMember.create({ data: { name: "TBD", role: "Crypto Agent",     agentCallsign: "CRYPTO AGENT",     order: 1, bio: "Somewhere on the ground floor. Ask around for the cipher key." } }),
    prisma.techTeamMember.create({ data: { name: "TBD", role: "Protocol Handler", agentCallsign: "PROTOCOL HANDLER", order: 2, bio: "Watches the corridor near the labs. Speaks in symbols." } }),
    prisma.techTeamMember.create({ data: { name: "TBD", role: "Data Archivist",   agentCallsign: "DATA ARCHIVIST",   order: 3, bio: "Guards the archive terminal. Only shows the ledger to verified operatives." } }),
    prisma.techTeamMember.create({ data: { name: "TBD", role: "Locksmith",        agentCallsign: "LOCKSMITH",        order: 4, bio: "Carries the combination in their head, never in writing." } }),
    prisma.techTeamMember.create({ data: { name: "TBD", role: "The Insider",      agentCallsign: "THE INSIDER",      order: 5, bio: "Blends in with the crowd. Match every trait or they'll deny everything." } }),
  ]);

  const m1 = await prisma.mission.create({
    data: {
      orderIndex: 1,
      title: "CRACK THE CIPHER",
      type: MissionType.CIPHER,
      description: "Decode encrypted transmissions to locate your first contact.",
      briefingText:
        "> INCOMING TRANSMISSION\n> ENCRYPTION: CAESAR\n> DECODE TO PROCEED.",
      agentClueText:
        "Decoded message points to the CRYPTO AGENT. Find them in person. They will task you and hand over Fragment 1.",
      agentMemberId: crypto.id,
    },
  });
  await prisma.challenge.createMany({
    data: [
      {
        missionId: m1.id,
        orderInMission: 1,
        questionText: "Decode the encrypted message",
        questionData: {
          cipherText: "KHOOR",
          hintClue: "A → D (each letter shifted forward by 3)",
        },
        answer: "HELLO",
        points: 50,
        hintText: "Think about Caesar. Each letter has been shifted by 3.",
      },
      {
        missionId: m1.id,
        orderInMission: 2,
        questionText: "Decode the second message to find your next contact",
        questionData: { cipherText: "ILQG WKH FUBSWR DJHQW" },
        answer: "FIND THE CRYPTO AGENT",
        points: 50,
        fragmentValue: 7,
        hintText: "Same shift as before. Spaces stay.",
      },
    ],
  });

  const m2 = await prisma.mission.create({
    data: {
      orderIndex: 2,
      title: "DEAD PROTOCOL",
      type: MissionType.PROTOCOL,
      description: "Symbols map to letters. Letters map to physical directions.",
      briefingText:
        "> AGENT ONLINE\n> LEGACY PROTOCOL DETECTED\n> TRANSLATE THE SYMBOL STREAM.",
      agentClueText:
        "The decoded route leads to the PROTOCOL HANDLER. Show them your decoded sequence and they will release Fragment 2.",
      agentMemberId: protocol.id,
    },
  });
  await prisma.challenge.create({
    data: {
      missionId: m2.id,
      orderInMission: 1,
      questionText:
        "Decode the symbols using the protocol, then follow the physical directions",
      questionData: {
        legend: { "▲": "A", "●": "B", "■": "C", "◆": "D", "★": "E" },
        encoded: "■ ▲ ★ ●",
        directions: { A: "LEFT", B: "RIGHT", C: "FORWARD", E: "STOP" },
      },
      answer: "CAEB",
      points: 100,
      fragmentValue: 2,
      hintText: "The symbols map to letters. Find the letter for each symbol.",
    },
  });

  const m3 = await prisma.mission.create({
    data: {
      orderIndex: 3,
      title: "CORRUPTED DATA",
      type: MissionType.DATA_CORRUPTION,
      description: "One entry in the ledger is corrupted. Find it.",
      briefingText:
        "> DATA STREAM UNSTABLE\n> INTEGRITY CHECK REQUIRED\n> IDENTIFY THE ANOMALY.",
      agentClueText:
        "Report the corrupted line number to the DATA ARCHIVIST. They will confirm and release Fragment 3.",
      agentMemberId: archivist.id,
    },
  });
  await prisma.challenge.create({
    data: {
      missionId: m3.id,
      orderInMission: 1,
      questionText:
        "Find the corrupted entry. Which line number contains the error?",
      questionData: {
        entries: [
          "A7K92P",
          "A7K92P",
          "A7K92P",
          "A7K92P",
          "A7K92P",
          "A7K92P",
          "A7K92P",
          "A7K92P",
          "A7K92P",
          "A7K92R",
          "A7K92P",
          "A7K92P",
          "A7K92P",
          "A7K92P",
          "A7K92P",
        ],
      },
      answer: "10",
      points: 100,
      fragmentValue: 9,
      hintText:
        "Compare every single character in every line. One line is different.",
    },
  });

  const m4 = await prisma.mission.create({
    data: {
      orderIndex: 4,
      title: "THE DIGITAL LOCK",
      type: MissionType.LOGIC_LOCK,
      description: "Deduce the 3-digit combination from the clues.",
      briefingText:
        "> VAULT SUBSYSTEM LOCKED\n> DEDUCE THE COMBINATION\n> LOGIC IS YOUR KEY.",
      agentClueText:
        "Bring the combination to the LOCKSMITH. Recite it correctly and they will hand over Fragment 4.",
      agentMemberId: locksmith.id,
    },
  });
  await prisma.challenge.create({
    data: {
      missionId: m4.id,
      orderInMission: 1,
      questionText: "Crack the 3-digit lock using the clues",
      questionData: {
        clues: [
          { code: "682", hint: "One digit is correct and correctly placed" },
          { code: "614", hint: "One digit is correct but wrongly placed" },
          { code: "206", hint: "Two digits are correct but both wrongly placed" },
          { code: "738", hint: "Nothing is correct" },
          { code: "780", hint: "One digit is correct but wrongly placed" },
        ],
      },
      answer: "042",
      points: 100,
      fragmentValue: 4,
      hintText:
        "Start by eliminating digits using clue 738 — none of 7, 3, or 8 appear in the answer.",
    },
  });

  const m5 = await prisma.mission.create({
    data: {
      orderIndex: 5,
      title: "FIND THE INSIDER",
      type: MissionType.INSIDER,
      description:
        "A member of the Tech Team is the insider. Find them by matching ALL five traits.",
      briefingText:
        "> ONE OF THEM IS THE INSIDER\n> TALK TO THE TECH TEAM\n> ALL TRAITS MUST MATCH.",
      agentClueText:
        "The INSIDER matches every trait. Find them, verify all five, and they will hand over Fragment 5.",
      agentMemberId: insider.id,
    },
  });
  await prisma.challenge.create({
    data: {
      missionId: m5.id,
      orderInMission: 1,
      questionText: "Find the Tech Team member who matches ALL these traits",
      questionData: {
        traits: [
          "Has participated in a hackathon",
          "Knows Python",
          "Has worked on an AI project",
          "Loves gaming",
          "Has broken a laptop accidentally",
        ],
      },
      answer: null,
      points: 100,
      fragmentValue: 1,
      hintText:
        "Ask each senior directly. They must match ALL five traits, not just some.",
    },
  });

  // Alternate challenge bank — kept as isAlternate=true, unattached to team play by default
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
  await prisma.challenge.createMany({
    data: [
      // Cipher alternatives
      {
        missionId: alt.id,
        questionText: "Decode ROT13: 'URYYB'",
        questionData: { cipherText: "URYYB", cipher: "ROT13" },
        answer: "HELLO",
        points: 50,
        hintText: "Halfway through the alphabet.",
        isAlternate: true,
      },
      {
        missionId: alt.id,
        questionText: "Decode: 'EDOC EHT KCARC'",
        questionData: { cipherText: "EDOC EHT KCARC", cipher: "REVERSE" },
        answer: "CRACK THE CODE",
        points: 50,
        hintText: "Read it backwards.",
        isAlternate: true,
      },
      {
        missionId: alt.id,
        questionText: "Decode Atbash: 'SVOOL'",
        questionData: { cipherText: "SVOOL", cipher: "ATBASH" },
        answer: "HELLO",
        points: 50,
        hintText: "A=Z, B=Y, C=X ...",
        isAlternate: true,
      },
      {
        missionId: alt.id,
        questionText: "Decode binary: '01001000 01001001'",
        questionData: { cipherText: "01001000 01001001", cipher: "BINARY" },
        answer: "HI",
        points: 50,
        hintText: "Computers speak in 0s and 1s.",
        isAlternate: true,
      },
      {
        missionId: alt.id,
        questionText: "Decode morse: '.... . .-.. .-.. ---'",
        questionData: { cipherText: ".... . .-.. .-.. ---", cipher: "MORSE" },
        answer: "HELLO",
        points: 50,
        hintText: "Dots and dashes.",
        isAlternate: true,
      },
      // Logic/Math alternatives
      {
        missionId: alt.id,
        questionText: "If A=1, B=2... what is CODE?",
        questionData: { prompt: "Sum the letter positions of C,O,D,E" },
        answer: "27",
        points: 100,
        hintText: "C=3, O=15, D=4, E=5.",
        isAlternate: true,
      },
      {
        missionId: alt.id,
        questionText: "What comes next: 2, 6, 12, 20, 30, ?",
        questionData: { sequence: [2, 6, 12, 20, 30] },
        answer: "42",
        points: 100,
        hintText: "Differences are 4, 6, 8, 10, ...",
        isAlternate: true,
      },
      {
        missionId: alt.id,
        questionText:
          "I am an odd number. Remove one letter and I become even. What am I?",
        questionData: {},
        answer: "SEVEN",
        points: 100,
        hintText: "It's a spelling trick.",
        isAlternate: true,
      },
      {
        missionId: alt.id,
        questionText: "Convert hex 0x1F to decimal",
        questionData: { hex: "1F" },
        answer: "31",
        points: 100,
        hintText: "1*16 + 15.",
        isAlternate: true,
      },
      // Trivia
      { missionId: alt.id, questionText: "What does HTML stand for?", questionData: {}, answer: "HYPERTEXT MARKUP LANGUAGE", points: 50, isAlternate: true },
      { missionId: alt.id, questionText: "Who created Linux?", questionData: {}, answer: "LINUS TORVALDS", points: 50, isAlternate: true },
      { missionId: alt.id, questionText: "What does CPU stand for?", questionData: {}, answer: "CENTRAL PROCESSING UNIT", points: 50, isAlternate: true },
      { missionId: alt.id, questionText: "In which year was the first iPhone released?", questionData: {}, answer: "2007", points: 50, isAlternate: true },
      { missionId: alt.id, questionText: "What language is known as the language of the web?", questionData: {}, answer: "JAVASCRIPT", points: 50, isAlternate: true },
      { missionId: alt.id, questionText: "What does API stand for?", questionData: {}, answer: "APPLICATION PROGRAMMING INTERFACE", points: 50, isAlternate: true },
      { missionId: alt.id, questionText: "Output of print(type(42)) in Python?", questionData: {}, answer: "<CLASS 'INT'>", points: 50, isAlternate: true },
      { missionId: alt.id, questionText: "How many bits in a byte?", questionData: {}, answer: "8", points: 50, isAlternate: true },
      { missionId: alt.id, questionText: "What does SQL stand for?", questionData: {}, answer: "STRUCTURED QUERY LANGUAGE", points: 50, isAlternate: true },
      { missionId: alt.id, questionText: "What company developed React?", questionData: { accepts: ["FACEBOOK", "META"] }, answer: "FACEBOOK", points: 50, isAlternate: true },
    ],
  });

  console.log("✅ Seed complete. Master key = 72941");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
