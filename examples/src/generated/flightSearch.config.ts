// Hand-written INPUT for the generated --live --form-prop demo (like
// flightSearchSchema.ts, this file feeds the pipeline — it is not CLI
// output): the formstand config scripts/generate-cli-demos.mjs passes via
// --config. origin/destination are plain z.string() ICAO fields whose
// suggestions are DATA (an airport list), not a zod enum — exactly the case
// per-field component overrides exist for — so the fields block upgrades
// them to autocomplete with an options prop: the generated component then
// requires originOptions/destinationOptions: readonly string[], and the
// hand-written consumer page (FlightSearchLive.tsx) supplies the list.
export default {
  fields: {
    origin: { component: "autocomplete", optionsProp: true },
    destination: { component: "autocomplete", optionsProp: true },
  },
};
