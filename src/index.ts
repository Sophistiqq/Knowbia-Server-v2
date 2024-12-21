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

let onGoingAssessments: any[] = [];
let restrictedStudents: any[] = [];

const app = new Elysia()
  .use(cors())
  .post("/assessments/save", ({ body }) => {
    const { title, description, time_limit, shuffle_questions, section, questions } = body;
    console.table(body)
    const existing = db.prepare("SELECT * FROM assessments WHERE title = ? AND description = ?").get(title, description); // Prepare the SQL statement
    if (existing) {
      db.run("UPDATE assessments SET time_limit = ?, shuffle_questions = ?, section = ?, questions = ? WHERE title = ? AND description = ?", [time_limit, shuffle_questions, section, JSON.stringify(questions), title, description]);
      return { status: "success", message: "Assessment updated!" };
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
  .get("/assessments/get/:id", ({ params }) => {
    const assessment = db.prepare("SELECT * FROM assessments WHERE id = ?").get(params.id);
    return assessment;
  })
  .post("/assessments/distribute", ({ body }) => {
    const { title, description, time_limit, shuffle_questions, section, questions } = body;
    console.log(shuffle_questions)
    const existing = onGoingAssessments.find(assessment => assessment.title === title && assessment.description === description);
    if (existing) {
      return { status: "error", message: "Assessment is already ongoing!" };
    }
    onGoingAssessments.push(body);
    db.run("INSERT INTO distributed_assessments (title, description, time_limit, shuffle_questions, section, questions) VALUES (?, ?,?, ?, ?, ?)", [title, description, time_limit, shuffle_questions, section, JSON.stringify(questions)]);
    return { status: "success", message: "Assessment distributed!" };
  }, {
    body: AssessmentType
  })
  .get("/assessments/ongoing", () => {
    return onGoingAssessments;
  })
  .post("/control/stop-assessment", ({ body }) => {
    const { title, description } = body;
    const index = onGoingAssessments.findIndex(assessment => assessment.title === title && assessment.description === description);
    if (index === -1) {
      return { status: "error", message: "Assessment not found!" };
    }
    onGoingAssessments.splice(index, 1);
    return { status: "success", message: "Assessment stopped!" };
  }, {
    body: AssessmentType
  })
  .get("/page/manage-assessments", () => {
    // This is where the necessarry data for the manage assessments page will be fetched, such as the list of ongoing assessment, restricted students
    return { onGoingAssessments: onGoingAssessments, restrictedStudents, status: "success", message: "Data fetched!" };
  })

  .listen(3000);


console.log("Server is running on port 3000");


