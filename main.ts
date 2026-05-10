import { CFLTTransformer } from "./src/core/transformer";

async function main() {
  const input = process.argv[2];
  if (!input) {
    console.log("Usage: ts-node main.ts \"<Chinese sentence>\"");
    return;
  }

  console.log(`\n--- Core First TypeScript Transformation ---`);
  console.log(`Input: ${input}`);

  const transformer = new CFLTTransformer();
  const result = await transformer.transform(input);

  if ('error' in result) {
    console.error("Error:", result.error);
    console.log("Raw Response:", result.raw);
    return;
  }

  console.log(`\n[Core First Native Logic]: ${result.cflt_l1}`);
  console.log(`[Core First Target Logic]: ${result.cflt_l2}`);
  console.log(`[Standard English]:  ${result.standard_l2}`);
  console.log(`[Standard Native]:   ${result.standard_l1}`);

  if (result.corrections.length > 0) {
    console.log(`\n[Corrections]:`);
    result.corrections.forEach(c => {
      console.log(`- ${c.type.toUpperCase()}: ${c.original} -> ${c.replacement} (${c.reason})`);
    });
  }
}

main().catch(console.error);
