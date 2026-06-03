import {
  type Form,
  numberInputProps,
  textInputProps,
  useField,
  useFieldArray,
  useForm,
} from "zustand-forms";
import { z } from "zod";
import { StateDump } from "./StateDump";

const trackSchema = z.object({
  title: z.string().min(1, "title required"),
  durationMin: z.number().positive("must be > 0"),
});

const albumSchema = z.object({
  title: z.string().min(1, "title required"),
  tracks: z.array(trackSchema).min(1, "at least one track"),
});

const schema = z.object({
  albums: z.array(albumSchema).min(1, "at least one album"),
});

type Schema = typeof schema;
type Album = z.input<typeof albumSchema>;
type Track = z.input<typeof trackSchema>;

type TrackRowProps = Readonly<{
  form: Form<Schema>;
  albumIndex: number;
  trackIndex: number;
  onRemove: () => void;
  onUp: () => void;
  onDown: () => void;
  canUp: boolean;
  canDown: boolean;
}>;

const TrackRow = ({
  form,
  albumIndex,
  trackIndex,
  onRemove,
  onUp,
  onDown,
  canUp,
  canDown,
}: TrackRowProps) => {
  const title = useField(
    form,
    `albums.${albumIndex}.tracks.${trackIndex}.title`,
  );
  const durationMin = useField(
    form,
    `albums.${albumIndex}.tracks.${trackIndex}.durationMin`,
  );
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "2fr 1fr auto auto auto",
        gap: 8,
        marginBottom: 6,
        alignItems: "start",
      }}
    >
      <div>
        <input
          placeholder="track title"
          {...textInputProps(title)}
          style={{ width: "100%" }}
        />
        <div className="error" style={{ marginTop: 2 }}>
          {title.error?.[0] ?? " "}
        </div>
      </div>
      <div>
        <input
          placeholder="min"
          {...numberInputProps(durationMin)}
          style={{ width: "100%" }}
        />
        <div className="error" style={{ marginTop: 2 }}>
          {durationMin.error?.[0] ?? " "}
        </div>
      </div>
      <button className="secondary" type="button" onClick={onUp} disabled={!canUp}>
        ↑
      </button>
      <button
        className="secondary"
        type="button"
        onClick={onDown}
        disabled={!canDown}
      >
        ↓
      </button>
      <button className="secondary" type="button" onClick={onRemove}>
        ×
      </button>
    </div>
  );
};

type AlbumRowProps = Readonly<{
  form: Form<Schema>;
  index: number;
  onRemove: () => void;
  onUp: () => void;
  onDown: () => void;
  canUp: boolean;
  canDown: boolean;
}>;

const AlbumRow = ({
  form,
  index,
  onRemove,
  onUp,
  onDown,
  canUp,
  canDown,
}: AlbumRowProps) => {
  const albumTitle = useField(form, `albums.${index}.title`);
  const tracks = useFieldArray<Track>(form, `albums.${index}.tracks`);

  return (
    <div
      style={{
        border: "1px solid #1f2530",
        borderRadius: 8,
        padding: 16,
        marginBottom: 16,
      }}
    >
      <div className="row" style={{ marginBottom: 12 }}>
        <input
          placeholder="album title"
          {...textInputProps(albumTitle)}
          style={{ flex: 1 }}
        />
        <button className="secondary" type="button" onClick={onUp} disabled={!canUp}>
          ↑
        </button>
        <button
          className="secondary"
          type="button"
          onClick={onDown}
          disabled={!canDown}
        >
          ↓
        </button>
        <button className="secondary" type="button" onClick={onRemove}>
          remove album
        </button>
      </div>
      <div className="error" style={{ marginBottom: 8 }}>
        {albumTitle.error?.[0] ?? " "}
      </div>

      <div style={{ paddingLeft: 12, borderLeft: "2px solid #1f2530" }}>
        {tracks.fields.map((field, trackIndex) => (
          <TrackRow
            key={field.id}
            form={form}
            albumIndex={index}
            trackIndex={trackIndex}
            onRemove={() => tracks.remove(trackIndex)}
            onUp={() => tracks.move(trackIndex, trackIndex - 1)}
            onDown={() => tracks.move(trackIndex, trackIndex + 1)}
            canUp={trackIndex > 0}
            canDown={trackIndex < tracks.length - 1}
          />
        ))}

        {tracks.error ? (
          <div className="error" style={{ marginBottom: 6 }}>
            {tracks.error[0]}
          </div>
        ) : null}

        <button
          className="secondary"
          type="button"
          onClick={() => tracks.push({ title: "", durationMin: 0 })}
        >
          + add track
        </button>
      </div>
    </div>
  );
};

export const NestedArraysForm = () => {
  const form = useForm(schema, {
    initialValues: {
      albums: [
        {
          title: "Kid A",
          tracks: [
            { title: "Everything In Its Right Place", durationMin: 4 },
            { title: "Kid A", durationMin: 5 },
          ],
        },
      ],
    },
    mode: "onBlur",
  });
  const albums = useFieldArray<Album>(form, "albums");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void form.submit((data) => {
          window.alert(`saved: ${JSON.stringify(data, null, 2)}`);
        });
      }}
    >
      <p className="subtitle">
        Each album has its own track list. Reorder albums or tracks
        independently; stable IDs keep React keys aligned with the data at
        both levels.
      </p>

      {albums.fields.map((field, index) => (
        <AlbumRow
          key={field.id}
          form={form}
          index={index}
          onRemove={() => albums.remove(index)}
          onUp={() => albums.move(index, index - 1)}
          onDown={() => albums.move(index, index + 1)}
          canUp={index > 0}
          canDown={index < albums.length - 1}
        />
      ))}

      {albums.error ? (
        <div className="error" style={{ marginBottom: 8 }}>
          {albums.error[0]}
        </div>
      ) : null}

      <div className="row">
        <button
          className="secondary"
          type="button"
          onClick={() =>
            albums.push({ title: "", tracks: [{ title: "", durationMin: 1 }] })
          }
        >
          + add album
        </button>
        <button className="primary" type="submit">
          Save
        </button>
      </div>

      <StateDump form={form} />
    </form>
  );
};
