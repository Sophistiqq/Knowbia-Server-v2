import { Elysia, t } from "elysia";
import { AssessmentType, StudentType } from "./types";
import { Database } from "bun:sqlite"
import { cors } from "@elysiajs/cors";
import { swagger } from '@elysiajs/swagger'
import { jwt } from '@elysiajs/jwt'
import { hashSync, compareSync } from "bcryptjs";

const db = new Database("db.sqlite")
try {
  db.run("CREATE TABLE IF NOT EXISTS assessments (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, time_limit INTEGER, questions TEXT, shuffle_questions BOOLEAN, section TEXT)");
  db.run("CREATE TABLE IF NOT EXISTS distributed_assessments (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, time_limit INTEGER, questions TEXT, shuffle_questions BOOLEAN, section TEXT)");
  db.run("CREATE TABLE IF NOT EXISTS students (student_number TEXT PRIMARY KEY, first_name TEXT, last_name TEXT, email TEXT, password TEXT, section TEXT)");
  db.run("CREATE TABLE IF NOT EXISTS assessment_results (id INTEGER PRIMARY KEY AUTOINCREMENT, student_number TEXT, assessment TEXT, answers TEXT, time_taken INTEGER, total_points INTEGER, mistakes TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
} catch (e) {
  console.error(e);
}

let onGoingAssessments: any[] = [];
let restrictedStudents: any[] = [];

const app = new Elysia()
  .use(
    swagger({
      documentation: {
        info: {
          title: 'Knowbia Server Documentation',
          version: '2.0.0'
        }
      }
    })
  )
  .use(
    jwt({
      name: "jwt",
      secret: "Knowbia"
    })
  )
  .use(cors())
  .post("/assessments/save", ({ body }) => {
    const { title, description, time_limit, shuffle_questions, section, questions } = body;
    const existing: any = db.prepare("SELECT * FROM assessments WHERE title = ? AND description = ?").get(title, description); // Prepare the SQL statement
    if (existing) {
      db.run("UPDATE assessments SET time_limit = ?, shuffle_questions = ?, section = ?, questions = ? WHERE title = ? AND description = ?", [time_limit, shuffle_questions, section, JSON.stringify(questions), title, description]);
      return { status: "success", message: "Assessment updated!", id: existing.id };
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
    const existing = onGoingAssessments.find(assessment => assessment.title === title && assessment.description === description && assessment.section === section);
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
  .post("/control/unrestrict/:id", ({ params }) => {
    const index = restrictedStudents.findIndex(student => student.student_number === params.id);
    if (index === -1) {
      return { status: "error", message: "Student not found!" };
    }
    restrictedStudents.splice(index, 1);
    return { status: "success", message: "Successfully unrestricted" };
  }, {
    params: t.Object({ id: t.String() })
  })
  .get("/page/manage-assessments", () => {
    // This is where the necessarry data for the manage assessments page will be fetched, such as the list of ongoing assessment, restricted students
    return { onGoingAssessments, restrictedStudents, status: "success", message: "Data fetched!" };
  })
  .get('/assessments/delete/:id', ({ params }) => {
    const { id } = params;
    const existing = db.prepare("SELECT * FROM assessments WHERE id = ?").get(id);
    if (!existing) {
      return { status: "error", message: "Assessment not found!" };
    }
    db.run("DELETE FROM assessments WHERE id = ?", [id]);
    return { status: "success", message: "Assessment deleted!" };
  }, {
    params: t.Object({ id: t.Number() })
  })

  .post("/students/register", async ({ body }) => {
    const { student_number, first_name, last_name, email, password, section } = body;
    const hashedPassword = hashSync(password, 10);
    const existing = db.prepare("SELECT * FROM students WHERE student_number = ?").get(student_number);
    if (existing) {
      return { status: "error", message: "Student already exists!" };
    }
    db.run("INSERT INTO students (student_number, first_name, last_name, email, password, section) VALUES (?, ?, ?, ?, ?, ?)", [student_number, first_name, last_name, email, hashedPassword, section]);
    return { status: "success", message: "Student registered!" };
  }, {
    body: StudentType
  })
  .post("/students/login", async ({ body }) => {
    const { student_number, password } = body;
    const student: any = db.prepare("SELECT * FROM students WHERE student_number = ?").get(student_number);
    if (!student) {
      return { status: "error", message: "Student not found!" };
    }
    const isPasswordCorrect = compareSync(password, student.password);
    if (!isPasswordCorrect) {
      return { status: "error", message: "Invalid password!" };
    }
    return { status: "success", message: "Student logged in!", student_data: student };
  }, {
    body: t.Object({ student_number: t.String(), password: t.String() }),
    student: StudentType
  })
  .post("/students/submit", ({ body }) => {
    console.log(body);
    const { student_number, assessment, answers, time_taken, total_points, mistakes } = body;
    db.run("INSERT INTO assessment_results (student_number, assessment, answers, time_taken, total_points, mistakes) VALUES (?, ?, ?, ?, ?, ?)", [student_number, JSON.stringify(assessment), JSON.stringify(answers), time_taken, total_points, JSON.stringify(mistakes)]);
    return { status: "success", message: "Answers submitted!" };
  }, {
    body: t.Object({
      student_number: t.String(),
      assessment: AssessmentType,
      answers: t.Array(t.Any()),
      time_taken: t.Number(),
      total_points: t.Number(),
      mistakes: t.Any()
    }),
    student: StudentType
  })
  .post("/students/eligibility", ({ body }) => {
    const { student_number, assessment_id } = body;
    // if the student is restricted in the current assessment, return an error
    const isRestricted = restrictedStudents.find(student => student.assessment_id === assessment_id && student.student_number === student_number);
    if (isRestricted) {
      return { status: "error", message: "You are restricted from taking this assessment!" };
    }
    return { status: "success", message: "Eligible to take the assessment!" };
  }, {
    body: t.Object({
      student_number: t.String(),
      assessment_id: t.Number()
    })
  })
  .post("/students/detected", ({ body }) => {
    const { student_number, activity, assessment_id, student_name } = body;
    console.table(body);
    if (activity === "minimized" || activity === "cheating") {
      restrictedStudents.push({ assessment_id: assessment_id, student_number: student_number, reason: activity, student_name: student_name });
      return { status: "success", message: "Student restricted!" };
    }
    return { status: "success", message: "Activity logged!" };
  }, {
    body: t.Object({
      assessment_id: t.Number(),
      student_number: t.String(),
      activity: t.String(),
      student_name: t.String()
    })
  })
  .get("/page/dashboard", () => {
    const data = {
      students: 0,
      assessments: 0,
      onGoingAssessments: onGoingAssessments.length,
    };

    const students = db.query("SELECT * FROM students").all();
    const assessments = db.query("SELECT * FROM assessments").all();
    data.students = students.length;
    data.assessments = assessments.length;
    return data;
  })
  .listen(3000);


console.log("Server is running on port 3000");


