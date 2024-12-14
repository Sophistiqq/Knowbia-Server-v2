import { Elysia } from "elysia";
import { AssessmentType } from "./types";
import { Database } from "bun:sqlite"
import { cors } from "@elysiajs/cors";


const db = new Database("db.sqlite")
try {
  db.run("CREATE TABLE IF NOT EXISTS assessments (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, time_limit INTEGER, questions TEXT, shuffle_questions BOOLEAN, section TEXT)");
  db.run("CREATE TABLE IF NOT EXISTS distributed_assessments (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, time_limit INTEGER, questions TEXT, shuffle_questions BOOLEAN, section TEXT)");
} catch (e) {
  console.error(e);
}

let onGoingAssessment: any[] = [];

const app = new Elysia()
  .use(cors())
  .post("/assessments/save", ({ body }) => {
    const { title, description, time_limit, shuffle_questions, section, questions } = body;
    const existing = db.prepare("SELECT * FROM assessments WHERE title = ? AND description = ?").get(title, description); // Prepare the SQL statement
    if (existing) {
      return { status: "error", message: "Assessment already exists!" };
    }
    db.run("INSERT INTO assessments (title, description, time_limit, shuffle_questions, section, questions) VALUES (?, ?,?, ?, ?, ?)", [title, description, time_limit, shuffle_questions, section, JSON.stringify(questions)]);
    return { status: "success", message: "Assessment saved!" };
  }, {
    body: AssessmentType
  })
  .get("/assessments/list", () => {
    const assessments = db.query("SELECT * FROM assessments").all();
    return assessments;
  })
  .post("/assessments/distribute", ({ body }) => {
    const { title, description, time_limit, shuffle_questions, section, questions } = body;
    const existing = onGoingAssessment.find(assessment => assessment.title === title && assessment.description === description);
    if (existing) {
      return { status: "error", message: "Assessment is already ongoing!" };
    }
    onGoingAssessment.push(body);
    db.run("INSERT INTO distributed_assessments (title, description, time_limit, shuffle_questions, section, questions) VALUES (?, ?,?, ?, ?, ?)", [title, description, time_limit, shuffle_questions, section, JSON.stringify(questions)]);
    return { status: "success", message: "Assessment distributed!" };
  }, {
    body: AssessmentType
  })
  .get("/assessments/ongoing", () => {
    return onGoingAssessment;
  })
  .post("/reset", () => {
    db.run("DELETE FROM assessments");
  })

  .listen(3000);


console.log("Server is running on port 3000");


