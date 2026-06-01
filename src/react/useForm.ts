import { useState } from "react";
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
  const [form] = useState(() => createForm(schema, options));
  return form;
};
