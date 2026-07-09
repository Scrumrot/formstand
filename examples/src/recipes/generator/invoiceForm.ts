import { z } from "zod";
import {
    type Form,
    numberInputProps,
    textInputProps,
    useField,
    useFieldArray,
    useForm,
    useFormSelectorShallow,
    useFormError,
    useFormSelector,
    useSubmitCount,
    useIsSubmitting,
} from "formstand";

// this is me working out an idea. you can skip this for now


const lineItemSchema = z.object({
    description: z.string().min(1, "required"),
    quantity: z.int().positive("must be > 0"),
    unitPrice: z.number().nonnegative("must be >= 0"),
});

const schema = z.object({
    customer: z.string().min(1, "required"),
    lineItems: z.array(lineItemSchema).min(1, "at least one item"),
});

type Schema = typeof schema;