import { useRef } from "react";
import type { z } from "zod";
import {
  type CreateFormOptions,
  type Form,
  createForm,
} from "../core/createForm";

export const useForm = <TSchema extends z.ZodType>(
  schema: TSchema,
  options: CreateFormOptions<TSchema>,
): Form<TSchema> => {
  const formRef = useRef<Form<TSchema> | null>(null);
  return (formRef.current ??= createForm(schema, options));
};
