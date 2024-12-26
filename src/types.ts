import { t } from "elysia";

export const QuestionType = t.Object({
  id: t.Number(),
  question: t.String(),
  type: t.Union([
    t.Literal('multiple_choice'),
    t.Literal('short_answer'),
    t.Literal('true_false'),
    t.Literal('ranking'),
    t.Literal('essay'),
    t.Literal('linear_scale')
  ]),
  options: t.Optional(t.Array(t.String())),
  correctAnswers: t.Optional(t.Array(t.Any())),
  required: t.Boolean(),
  points: t.Number(),
  shuffleOptions: t.Boolean(),
  category: t.Optional(t.String()),
  hint: t.Optional(t.String()),
  media: t.Optional(t.Union([t.String(), t.Null()])),
  showMediaUpload: t.Optional(t.Boolean()),
  linearScaleStart: t.Optional(t.Number()),
  linearScaleEnd: t.Optional(t.Number()),
  linearScaleStep: t.Optional(t.Number())
});

export const AssessmentType = t.Object({
  title: t.String(),
  description: t.String(),
  time_limit: t.Number(),
  section: t.String(),
  shuffle_questions: t.Boolean(),
  questions: t.Array(QuestionType)
});


//body: t.Object({
//  student_id: t.Number(),
//  first_name: t.String(),
//  last_name: t.String(),
//  email: t.String(),
//  password: t.String(),
//  section: t.String()
//})
//

export const StudentType = t.Object({
  student_number: t.String(),
  first_name: t.String(),
  last_name: t.String(),
  email: t.String(),
  password: t.String(),
  section: t.String()
});
