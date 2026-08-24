UPDATE "Mission"
SET
  "title" = 'FIND THE INSIDER',
  "type" = 'INSIDER',
  "description" = 'Find the person carrying the fourth fragment.',
  "briefingText" = '> HUMAN INTEL REQUIRED\n> FIND THE INSIDER\n> VERIFY THE FINAL FRAGMENT.',
  "agentAppearance" = 'Bilkul jaise koi bhi doosra senior — koi giveaway nahi.',
  "agentAbout" = 'The fourth fragment is held by one person in the room.',
  "agentLocation" = 'Ask the tech team directly and verify the matching traits.'
WHERE "orderIndex" = 4;

UPDATE "Challenge"
SET
  "questionText" = 'Find the insider in person and ask for the fourth fragment.',
  "questionData" = '{"traits":["Chai over coffee — always","Has stayed up till 3 AM debugging","Fluent in Python AND Hindi memes","Has fixed someone else''s laptop for free","Owns 3+ tech-event T-shirts"]}'::jsonb,
  "answer" = NULL,
  "fragmentValue" = 1,
  "hintText" = 'Ask the tech team directly. All five traits must match before accepting the fragment.'
WHERE "missionId" = (SELECT "id" FROM "Mission" WHERE "orderIndex" = 4)
  AND "orderInMission" = 1;

UPDATE "GameConfig"
SET "masterKey" = '7291'
WHERE "id" = 'singleton';