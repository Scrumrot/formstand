import type { ComponentProps } from "react";
import { cn } from "../cn";

// One alias for all six parts — every card piece is a styled <div>.
export type CardProps = Readonly<ComponentProps<"div">>;

export const Card = ({ className, ...props }: CardProps) => (
  <div
    data-slot="card"
    className={cn(
      "flex flex-col gap-4 rounded-xl border bg-card py-4 text-card-foreground",
      className,
    )}
    {...props}
  />
);

export const CardHeader = ({ className, ...props }: CardProps) => (
  <div
    data-slot="card-header"
    className={cn("grid gap-1.5 px-4", className)}
    {...props}
  />
);

export const CardTitle = ({ className, ...props }: CardProps) => (
  <div
    data-slot="card-title"
    className={cn("font-semibold leading-none", className)}
    {...props}
  />
);

export const CardDescription = ({
  className,
  ...props
}: CardProps) => (
  <div
    data-slot="card-description"
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
);

export const CardContent = ({
  className,
  ...props
}: CardProps) => (
  <div data-slot="card-content" className={cn("px-4", className)} {...props} />
);

export const CardFooter = ({ className, ...props }: CardProps) => (
  <div
    data-slot="card-footer"
    className={cn("flex items-center px-4", className)}
    {...props}
  />
);
