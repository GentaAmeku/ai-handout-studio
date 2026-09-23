import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  buildDeckJsonSchema,
  buildDocumentJsonSchema,
  buildDocumentPatchJsonSchema,
  buildPatchJsonSchema,
} from "../app/src/schema/json-schema";

// skills/ai-handout-studio/*.schema.json を Zod のスキーマから作り直す(pnpm schema:export)
const files = [
  { name: "deck.schema.json", schema: buildDeckJsonSchema() },
  { name: "patch.schema.json", schema: buildPatchJsonSchema() },
  { name: "document.schema.json", schema: buildDocumentJsonSchema() },
  {
    name: "document-patch.schema.json",
    schema: buildDocumentPatchJsonSchema(),
  },
];

await Promise.all(
  files.map(async ({ name, schema }) => {
    const target = fileURLToPath(
      new URL(`../skills/ai-handout-studio/${name}`, import.meta.url),
    );
    await writeFile(target, `${JSON.stringify(schema, null, 2)}\n`, "utf8");
    console.log(`書き出した: ${target}`);
  }),
);
