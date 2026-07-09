import { useState } from "react";
import AddIcon from "@mui/icons-material/Add";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import DeleteIcon from "@mui/icons-material/Delete";
import {
  Alert,
  Box,
  Button,
  FormControl,
  IconButton,
  MenuItem,
  Select,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import {
  type Form,
  focusFirstError,
  useField,
  useFieldArray,
  useForm,
  useFormSelector,
  useIsDirty,
  useIsSubmitting,
} from "formstand";
import { z } from "zod";
import { useDemoForm } from "../demo/DemoShell";
import {
  muiNumberFieldProps,
  muiSelectProps,
  muiTextFieldProps,
} from "./muiAdapter";

const CATEGORIES = [
  { value: "services", label: "Services" },
  { value: "goods", label: "Goods" },
  { value: "expenses", label: "Expenses" },
] as const;

const lineItemSchema = z.object({
  description: z.string().min(1, "required"),
  category: z.enum(["services", "goods", "expenses"]),
  quantity: z.int("whole numbers").positive("must be > 0"),
  unitPrice: z.number().nonnegative("must be >= 0"),
});

const schema = z.object({
  customer: z.string().min(1, "customer required"),
  items: z.array(lineItemSchema).min(1, "an invoice needs at least one line item"),
});

type Schema = typeof schema;
type LineItem = z.input<typeof lineItemSchema>;

const NEW_ITEM: LineItem = {
  description: "",
  category: "services",
  quantity: 1,
  unitPrice: 0,
};

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

type ItemRowProps = Readonly<{
  form: Form<Schema>;
  index: number;
  count: number;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}>;

const ItemRow = ({
  form,
  index,
  count,
  onRemove,
  onMoveUp,
  onMoveDown,
}: ItemRowProps) => {
  const description = useField(form, `items.${index}.description`);
  const category = useField(form, `items.${index}.category`);
  const quantity = useField(form, `items.${index}.quantity`);
  const unitPrice = useField(form, `items.${index}.unitPrice`);
  const categoryProps = muiSelectProps(category);
  const rowTotal = (quantity.value ?? 0) * (unitPrice.value ?? 0);

  return (
    <TableRow>
      <TableCell sx={{ minWidth: 180 }}>
        <TextField
          variant="standard"
          fullWidth
          placeholder="Description"
          {...muiTextFieldProps(description)}
        />
      </TableCell>
      <TableCell sx={{ minWidth: 130 }}>
        <FormControl variant="standard" fullWidth error={categoryProps.error}>
          <Select {...categoryProps}>
            {CATEGORIES.map((c) => (
              <MenuItem key={c.value} value={c.value}>
                {c.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </TableCell>
      <TableCell sx={{ width: 90 }}>
        <TextField
          variant="standard"
          fullWidth
          {...muiNumberFieldProps(quantity)}
          slotProps={{ htmlInput: { min: 1, step: 1 } }}
        />
      </TableCell>
      <TableCell sx={{ width: 110 }}>
        <TextField
          variant="standard"
          fullWidth
          {...muiNumberFieldProps(unitPrice)}
          slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
        />
      </TableCell>
      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
        {usd.format(rowTotal)}
      </TableCell>
      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
        <IconButton
          size="small"
          aria-label="move up"
          disabled={index === 0}
          onClick={onMoveUp}
        >
          <ArrowUpwardIcon fontSize="inherit" />
        </IconButton>
        <IconButton
          size="small"
          aria-label="move down"
          disabled={index === count - 1}
          onClick={onMoveDown}
        >
          <ArrowDownwardIcon fontSize="inherit" />
        </IconButton>
        <IconButton size="small" aria-label="delete row" onClick={onRemove}>
          <DeleteIcon fontSize="inherit" />
        </IconButton>
      </TableCell>
    </TableRow>
  );
};

// Grand total in its own component: only this subtree re-renders as
// quantities and prices change.
const GrandTotal = ({ form }: Readonly<{ form: Form<Schema> }>) => {
  const items = useFormSelector(form, (s) => s.values.items);
  const total = items.reduce(
    (acc, item) => acc + (item.quantity ?? 0) * (item.unitPrice ?? 0),
    0,
  );
  return (
    <Typography variant="h6" sx={{ textAlign: "right", mt: 1 }}>
      Total: {usd.format(total)}
    </Typography>
  );
};

export const MuiInvoiceBuilder = () => {
  const form = useForm(schema, {
    initialValues: {
      customer: "Acme Corp",
      items: [
        {
          description: "Design sprint",
          category: "services",
          quantity: 3,
          unitPrice: 1200,
        },
        {
          description: "Standing desk",
          category: "goods",
          quantity: 2,
          unitPrice: 480.5,
        },
      ],
    },
    mode: "onBlur",
  });
  useDemoForm(form);
  const customer = useField(form, "customer");
  const items = useFieldArray(form, "items");
  const isDirty = useIsDirty(form);
  const isSubmitting = useIsSubmitting(form);
  const [saved, setSaved] = useState(false);

  return (
    <form
      onSubmit={form.handleSubmit(
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 400));
          // Rebase: the just-saved values become the new baseline, so the
          // form reads clean and Save disables until the next edit.
          form.adoptValues(form.getState().values);
          setSaved(true);
        },
        (errors) => focusFirstError(errors),
      )}
      noValidate
    >
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        A <code>useFieldArray</code> over a MUI table. Save is dirty-gated:
        it enables on the first edit and, after a successful save,{" "}
        <code>adoptValues</code> rebases the initial values so it disables
        again. Delete both rows to see the array-level{" "}
        <code>z.array(...).min(1)</code> error.
      </Typography>

      <TextField
        label="Customer"
        sx={{ mb: 2, maxWidth: 360 }}
        fullWidth
        {...muiTextFieldProps(customer)}
      />

      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Description</TableCell>
              <TableCell>Category</TableCell>
              <TableCell>Qty</TableCell>
              <TableCell>Unit price</TableCell>
              <TableCell align="right">Amount</TableCell>
              <TableCell align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {items.fields.map((field, index) => (
              <ItemRow
                key={field.id}
                form={form}
                index={index}
                count={items.length}
                onRemove={() => items.remove(index)}
                onMoveUp={() => items.move(index, index - 1)}
                onMoveDown={() => items.move(index, index + 1)}
              />
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {items.error?.[0] !== undefined ? (
        <Alert severity="error" sx={{ mt: 2 }}>
          {items.error[0]}
        </Alert>
      ) : null}

      <GrandTotal form={form} />

      <Box sx={{ display: "flex", gap: 1, mt: 2 }}>
        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={() => items.push(NEW_ITEM)}
        >
          Add line
        </Button>
        <Button
          variant="contained"
          type="submit"
          disabled={!isDirty || isSubmitting}
        >
          {isSubmitting ? "Saving..." : "Save invoice"}
        </Button>
      </Box>

      <Snackbar
        open={saved}
        autoHideDuration={4000}
        onClose={() => setSaved(false)}
      >
        <Alert
          severity="success"
          variant="filled"
          onClose={() => setSaved(false)}
        >
          Invoice saved — adoptValues rebased the form to clean.
        </Alert>
      </Snackbar>
    </form>
  );
};
