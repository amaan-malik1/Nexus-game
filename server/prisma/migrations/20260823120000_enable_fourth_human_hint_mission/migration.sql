UPDATE "Mission"
SET "isActive" = CASE WHEN "orderIndex" = 4 THEN true ELSE false END
WHERE "orderIndex" > 3 AND "orderIndex" < 99;