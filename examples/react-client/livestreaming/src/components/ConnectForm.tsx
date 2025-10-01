import { useState } from "react";
import { useForm } from "react-hook-form";

import { useFishjamId } from "@/lib/fishjamContext";

import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

type FormValues = {
  fishjamId: string;
};

export const ConnectForm = () => {
  const { fishjamId, setFishjamId } = useFishjamId();
  const [isLocked, setIsLocked] = useState(!!fishjamId);

  const form = useForm<FormValues>({
    defaultValues: {
      fishjamId: fishjamId,
    },
  });

  function onSubmit(values: FormValues) {
    setIsLocked(true);
    setFishjamId(values.fishjamId);
  }

  return (
    <Card className="flex-grow mt-4 w-full max-w-lg">
      <CardContent className="space-y-2">
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-2">
          <Label htmlFor="fishjam-id">
            Your Fishjam ID
            <span className="text-muted-foreground">(required)</span>
          </Label>
          <div className="flex w-full items-center space-x-2">
            <Input
              id="fishjam-id"
              required
              {...form.register("fishjamId")}
              placeholder="Your Fishjam ID"
              disabled={isLocked}
            />

            {isLocked ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setIsLocked(false);
                }}
              >
                Change
              </Button>
            ) : (
              <Button type="button" onClick={form.handleSubmit(onSubmit)}>
                Submit
              </Button>
            )}
          </div>
          {form.formState.errors.fishjamId ? (
            <p className="text-red-500 text-xs">
              {form.formState.errors.fishjamId.message}
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">
              You can find your Fishjam ID in the{" "}
              <a
                href="https://fishjam.io/app/"
                target="_blank"
                className="underline"
              >
                Fishjam Dashboard
              </a>
              .
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
};
