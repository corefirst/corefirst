import { CoursewareOrchestrator } from "../generator/orchestrator";

async function main() {
  const ageGroup = process.argv[2] || "Child (Age 8)";
  const category = process.argv[3] || "General / Life";
  const topic = process.argv[4] || "At the Zoo";

  console.log(`\n--- Core First Courseware Generator ---`);
  console.log(`Age Group: ${ageGroup}`);
  console.log(`Category:  ${category}`);
  console.log(`Topic:     ${topic}`);

  const orchestrator = new CoursewareOrchestrator();
  const result = await orchestrator.generate({
    age_group: ageGroup,
    category_context: category,
    topic: topic
  });

  if ('error' in result) {
    console.error("Error:", result.error);
    console.log("Raw Response:", result.raw);
    process.exit(1);
  }

  console.log(`\n=== Course: ${result.topic} ===`);
  result.lessons.forEach((lesson, index) => {
    console.log(`\n[Lesson ${index + 1}]: ${lesson.title}`);
    console.log(`Scenario: ${lesson.scenario_description}`);

    console.log(`\nScript:`);
    lesson.cflt_scripts.forEach(s => {
      console.log(`${s.speaker}: ${s.standard_l2}`);
      console.log(`  (CFLT-L1): ${s.cflt_l1}`);
      console.log(`  (SSML):    ${s.ssml}`);
    });

    console.log(`\nVocabulary Focus:`);
    lesson.vocabulary_focus.forEach(v => {
      console.log(`- ${v.token}: ${v.meaning}`);
    });

    const firstPrompt = lesson.visual_generation_prompts[0];
    if (firstPrompt) {
      console.log(`\nVisual Prompt: ${firstPrompt}`);
    }
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
