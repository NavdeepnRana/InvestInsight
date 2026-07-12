import { searchWeb } from "./src/tools/researchTools.js";

const result = await searchWeb.invoke({ query: "Apple Q4 earnings 2024" });
console.log(result);
