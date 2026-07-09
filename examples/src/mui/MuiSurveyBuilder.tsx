import { useState } from "react";
import AddIcon from "@mui/icons-material/Add";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import DeleteIcon from "@mui/icons-material/Delete";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import {
  type Form,
  focusFirstError,
  useField,
  useFieldArray,
  useForm,
  useFormError,
  useFormSelector,
} from "formstand";
import { z } from "zod";
import { useDemoForm } from "../demo/DemoShell";
import { muiSelectProps, muiTextFieldProps } from "./muiAdapter";

const QUESTION_TYPES = [
  { value: "text", label: "Free text" },
  { value: "choice", label: "Multiple choice" },
  { value: "scale", label: "Scale" },
] as const;

const questionSchema = z
  .object({
    prompt: z.string().min(1, "prompt required"),
    type: z.enum(["text", "choice", "scale"]),
    // Comma-separated; only meaningful (and only validated) for "choice".
    options: z.string(),
    scaleMax: z.union([z.literal(5), z.literal(10)]),
  })
  .refine((q) => q.type !== "choice" || q.options.trim().length > 0, {
    message: "choice questions need at least one option",
    path: ["options"],
  });

const sectionSchema = z.object({
  title: z.string().min(1, "section title required"),
  questions: z.array(questionSchema),
});

const schema = z
  .object({
    title: z.string().min(1, "survey title required"),
    sections: z.array(sectionSchema).min(1, "add at least one section"),
  })
  // No path: this refine lands at the root "" key, read by useFormError.
  .refine(
    (s) => s.sections.some((section) => section.questions.length > 0),
    { message: "a survey needs at least one question overall" },
  );

type Schema = typeof schema;
type Section = z.input<typeof sectionSchema>;
type Question = z.input<typeof questionSchema>;

const NEW_QUESTION: Question = {
  prompt: "",
  type: "text",
  options: "",
  scaleMax: 5,
};

const NEW_SECTION: Section = { title: "", questions: [NEW_QUESTION] };

type QuestionEditorProps = Readonly<{
  form: Form<Schema>;
  sectionIndex: number;
  questionIndex: number;
  count: number;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}>;

const QuestionEditor = ({
  form,
  sectionIndex,
  questionIndex,
  count,
  onRemove,
  onMoveUp,
  onMoveDown,
}: QuestionEditorProps) => {
  const base = `sections.${sectionIndex}.questions.${questionIndex}` as const;
  const prompt = useField(form, `${base}.prompt`);
  const type = useField(form, `${base}.type`);
  const options = useField(form, `${base}.options`);
  const scaleMax = useField(form, `${base}.scaleMax`);
  const typeProps = muiSelectProps(type);
  const optionsProps = muiTextFieldProps(options);

  return (
    <Box
      sx={{
        display: "flex",
        gap: 1,
        alignItems: "flex-start",
        py: 1,
        borderTop: 1,
        borderColor: "divider",
      }}
    >
      <Stack spacing={1} sx={{ flexGrow: 1 }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
          <TextField
            label={`Question ${questionIndex + 1}`}
            size="small"
            fullWidth
            {...muiTextFieldProps(prompt)}
          />
          <FormControl
            size="small"
            sx={{ minWidth: 170 }}
            error={typeProps.error}
          >
            <InputLabel id={`${base}-type-label`}>Type</InputLabel>
            <Select
              labelId={`${base}-type-label`}
              label="Type"
              {...typeProps}
            >
              {QUESTION_TYPES.map((t) => (
                <MenuItem key={t.value} value={t.value}>
                  {t.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>

        {type.value === "choice" ? (
          <TextField
            label="Options (comma separated)"
            size="small"
            fullWidth
            {...optionsProps}
            helperText={optionsProps.helperText ?? "e.g. Red, Green, Blue"}
          />
        ) : null}

        {type.value === "scale" ? (
          <Box>
            <Typography variant="caption" color="text.secondary">
              Scale range
            </Typography>
            <Box>
              <ToggleButtonGroup
                exclusive
                size="small"
                value={scaleMax.value}
                onChange={(_event, next: 5 | 10 | null) => {
                  if (next !== null) {
                    scaleMax.setValue(next);
                  }
                }}
              >
                <ToggleButton value={5}>1 – 5</ToggleButton>
                <ToggleButton value={10}>1 – 10</ToggleButton>
              </ToggleButtonGroup>
            </Box>
          </Box>
        ) : null}
      </Stack>

      <Box sx={{ whiteSpace: "nowrap", pt: 0.5 }}>
        <IconButton
          size="small"
          aria-label="move question up"
          disabled={questionIndex === 0}
          onClick={onMoveUp}
        >
          <ArrowUpwardIcon fontSize="inherit" />
        </IconButton>
        <IconButton
          size="small"
          aria-label="move question down"
          disabled={questionIndex === count - 1}
          onClick={onMoveDown}
        >
          <ArrowDownwardIcon fontSize="inherit" />
        </IconButton>
        <IconButton
          size="small"
          aria-label="remove question"
          onClick={onRemove}
        >
          <DeleteIcon fontSize="inherit" />
        </IconButton>
      </Box>
    </Box>
  );
};

type SectionEditorProps = Readonly<{
  form: Form<Schema>;
  index: number;
  count: number;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}>;

const SectionEditor = ({
  form,
  index,
  count,
  onRemove,
  onMoveUp,
  onMoveDown,
}: SectionEditorProps) => {
  const title = useField(form, `sections.${index}.title`);
  const questions = useFieldArray(
    form,
    `sections.${index}.questions`,
  );

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
          <TextField
            label={`Section ${index + 1} title`}
            size="small"
            fullWidth
            {...muiTextFieldProps(title)}
          />
          <Box sx={{ whiteSpace: "nowrap" }}>
            <IconButton
              size="small"
              aria-label="move section up"
              disabled={index === 0}
              onClick={onMoveUp}
            >
              <ArrowUpwardIcon fontSize="inherit" />
            </IconButton>
            <IconButton
              size="small"
              aria-label="move section down"
              disabled={index === count - 1}
              onClick={onMoveDown}
            >
              <ArrowDownwardIcon fontSize="inherit" />
            </IconButton>
            <IconButton
              size="small"
              aria-label="remove section"
              onClick={onRemove}
            >
              <DeleteIcon fontSize="inherit" />
            </IconButton>
          </Box>
        </Stack>

        <Box sx={{ mt: 1 }}>
          {questions.fields.map((field, questionIndex) => (
            <QuestionEditor
              key={field.id}
              form={form}
              sectionIndex={index}
              questionIndex={questionIndex}
              count={questions.length}
              onRemove={() => questions.remove(questionIndex)}
              onMoveUp={() => questions.move(questionIndex, questionIndex - 1)}
              onMoveDown={() =>
                questions.move(questionIndex, questionIndex + 1)
              }
            />
          ))}
        </Box>

        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={() => questions.push(NEW_QUESTION)}
        >
          Add question
        </Button>
      </CardContent>
    </Card>
  );
};

const QuestionCount = ({ form }: Readonly<{ form: Form<Schema> }>) => {
  const count = useFormSelector(form, (s) =>
    s.values.sections.reduce(
      (total, section) => total + section.questions.length,
      0,
    ),
  );
  return (
    <Chip
      label={`${count} question${count === 1 ? "" : "s"} total`}
      size="small"
      variant="outlined"
    />
  );
};

export const MuiSurveyBuilder = () => {
  const form = useForm(schema, {
    initialValues: {
      title: "Team health check",
      sections: [
        {
          title: "About your week",
          questions: [
            { prompt: "How was your week?", type: "text", options: "", scaleMax: 5 },
            {
              prompt: "Rate your energy level",
              type: "scale",
              options: "",
              scaleMax: 10,
            },
          ],
        },
      ],
    },
    mode: "onBlur",
  });
  useDemoForm(form);
  const title = useField(form, "title");
  const sections = useFieldArray(form, "sections");
  const rootError = useFormError(form);
  const [published, setPublished] = useState(false);

  return (
    <form
      onSubmit={form.handleSubmit(
        () => setPublished(true),
        (errors) => focusFirstError(errors),
      )}
      noValidate
    >
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Nested field arrays: sections each own a question list, reorderable
        at both levels. The question type switches its sub-editor, and a
        root-level <code>.refine</code> (keyed at <code>""</code>, read via{" "}
        <code>useFormError</code>) insists the survey has at least one
        question overall — empty every section and publish to see it.
      </Typography>

      <Stack
        direction="row"
        spacing={1}
        sx={{ mb: 2, alignItems: "center" }}
      >
        <TextField
          label="Survey title"
          size="small"
          sx={{ maxWidth: 360 }}
          fullWidth
          {...muiTextFieldProps(title)}
        />
        <QuestionCount form={form} />
      </Stack>

      {rootError?.[0] !== undefined ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {rootError[0]}
        </Alert>
      ) : null}

      <Stack spacing={2}>
        {sections.fields.map((field, index) => (
          <SectionEditor
            key={field.id}
            form={form}
            index={index}
            count={sections.length}
            onRemove={() => sections.remove(index)}
            onMoveUp={() => sections.move(index, index - 1)}
            onMoveDown={() => sections.move(index, index + 1)}
          />
        ))}
      </Stack>

      {sections.error?.[0] !== undefined ? (
        <Alert severity="error" sx={{ mt: 2 }}>
          {sections.error[0]}
        </Alert>
      ) : null}

      <Box sx={{ display: "flex", gap: 1, mt: 2 }}>
        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={() => sections.push(NEW_SECTION)}
        >
          Add section
        </Button>
        <Button variant="contained" type="submit">
          Publish survey
        </Button>
      </Box>

      <Snackbar
        open={published}
        autoHideDuration={4000}
        onClose={() => setPublished(false)}
      >
        <Alert
          severity="success"
          variant="filled"
          onClose={() => setPublished(false)}
        >
          Survey published.
        </Alert>
      </Snackbar>
    </form>
  );
};
