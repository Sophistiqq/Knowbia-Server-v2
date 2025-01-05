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
  db.run("CREATE TABLE IF NOT EXISTS assessment_results (assessment_id INTEGER, student_number TEXT, assessment TEXT, answers TEXT, time_taken INTEGER, total_points INTEGER, mistakes TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)");
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
      let id = existing.id;
      return { status: "success", message: "Assessment updated!", id };
    }
    const id: any = db.prepare("SELECT id FROM assessments ORDER BY id DESC LIMIT 1").get();
    db.run("INSERT INTO assessments (title, description, time_limit, shuffle_questions, section, questions) VALUES (?, ?,?, ?, ?, ?)", [title, description, time_limit, shuffle_questions, section, JSON.stringify(questions)]);
    return { status: "success", message: "Assessment saved!", id };
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
    const { title, description, time_limit, shuffle_questions, section, questions, id } = body;
    console.table(body);
    const existing = onGoingAssessments.find(assessment => assessment.title === title && assessment.description === description && assessment.section === section && assessment.id === id);
    if (existing) {
      return { status: "error", message: "Assessment is already ongoing!" };
    }
    onGoingAssessments.push(body);
    console.log(onGoingAssessments);
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
    const { student_number, assessment, answers, time_taken, total_points, mistakes, assessment_id } = body;
    db.run("INSERT INTO assessment_results (assessment_id, student_number, assessment, answers, time_taken, total_points, mistakes) VALUES (?, ?, ?, ?, ?, ?, ?)", [assessment_id, student_number, JSON.stringify(assessment), JSON.stringify(answers), time_taken, total_points, JSON.stringify(mistakes)]);
    return { status: "success", message: "Answers submitted!" };
  }, {
    body: t.Object({
      assessment_id: t.Number(),
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
    // if the student already submitted the assessment, return an error
    const hasSubmitted = db.prepare("SELECT * FROM assessment_results WHERE student_number = ? AND assessment_id = ?").get(student_number, assessment_id);
    if (hasSubmitted) {
      return { status: "error", message: "You have already submitted this assessment!" };
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
  .post("/students/delete", ({ body }) => {
    const { student_number } = body;
    const student = db.prepare("SELECT * FROM students WHERE student_number = ?").get(student_number);
    if (!student) {
      return { status: "error", message: "Student not found!" };
    }
    db.run("DELETE FROM students WHERE student_number = ?", [student_number]);
    return { status: "success", message: "Student deleted!" };
  }, {
    body: StudentType
  })
  .post("/students/edit", ({ body }) => {
    const { student_number, first_name, last_name, email, password, section } = body;
    if (password !== "") {
      const hashedPassword = hashSync(password, 10);
      db.run("UPDATE students SET first_name = ?, last_name = ?, email = ?, password = ?, section = ? WHERE student_number = ?", [first_name, last_name, email, hashedPassword, section, student_number]);
    } else {
      db.run("UPDATE students SET first_name = ?, last_name = ?, email = ?, section = ? WHERE student_number = ?", [first_name, last_name, email, section, student_number]);
    }
    return { status: "success", message: "Student updated!" };
  }, {
    body: StudentType
  })
  .get("/page/dashboard", () => {
    const savedAssessments = db.query("SELECT * FROM assessments").all();
    const students = db.query("SELECT * FROM students").all();
    const ongoingAssessments = onGoingAssessments;
    const completedAssessments = db.query("SELECT * FROM assessment_results").all();
    const topPerformers = db.query("SELECT student_number, (SELECT first_name || ' ' || last_name FROM students WHERE students.student_number = assessment_results.student_number) as student_name, SUM(total_points) as total_points FROM assessment_results GROUP BY student_number ORDER BY total_points DESC LIMIT 5").all();
    return {
      savedAssessments: savedAssessments.length,
      students: students.length,
      ongoingAssessments: ongoingAssessments.length,
      completedAssessments: completedAssessments.length,
      topPerformers: topPerformers,
      status: "success",
      message: "Data fetched!"
    };
  })
  .get("/page/manage-students", () => {
    const students = db.query("SELECT * FROM students").all();
    return students;
  })

  .get("/api/scores/average-over-time", () => {
    const results = db.query("SELECT DATE(created_at) as date, AVG(total_points) as average_score FROM assessment_results GROUP BY DATE(created_at)").all();
    const labels = results.map(result => result.date);
    const values = results.map(result => result.average_score);
    return { labels, values, status: "success", message: "Data fetched!" };
  })
  .get("/api/scores/distribution", () => {
    const results = db.query("SELECT total_points FROM assessment_results").all();
    const distribution = {
      '0-10': 0,
      '11-20': 0,
      '21-30': 0,
      '31-40': 0,
      '41-50': 0,
      '51-60': 0,
      '61-70': 0,
      '71-80': 0,
      '81-90': 0,
      '91-100': 0
    };
    results.forEach(result => {
      const score = result.total_points;
      if (score <= 10) distribution['0-10']++;
      else if (score <= 20) distribution['11-20']++;
      else if (score <= 30) distribution['21-30']++;
      else if (score <= 40) distribution['31-40']++;
      else if (score <= 50) distribution['41-50']++;
      else if (score <= 60) distribution['51-60']++;
      else if (score <= 70) distribution['61-70']++;
      else if (score <= 80) distribution['71-80']++;
      else if (score <= 90) distribution['81-90']++;
      else distribution['91-100']++;
    });
    const labels = Object.keys(distribution);
    const values = Object.values(distribution);
    return { labels, values, status: "success", message: "Data fetched!" };
  })
  .get("/page/assessment-results", () => {
    const results = db.query("SELECT * FROM assessment_results").all();
    const assessments = db.query("SELECT * FROM assessments").all();
    const students = db.query("SELECT * FROM students").all();
    const questions_and_answers = db.query("SELECT assessment_results.assessment_id, assessment_results.answers, assessments.questions, students.student_number, students.first_name, students.last_name, students.email FROM assessment_results INNER JOIN assessments ON assessment_results.assessment_id = assessments.id INNER JOIN students ON assessment_results.student_number = students.student_number").all();

    return {
      results,
      assessments,
      students,
      questions_and_answers,
      status: "success",
      message: "Data fetched!"
    };
  })

  .listen(3000)
console.log("Server is running on port 3000");

