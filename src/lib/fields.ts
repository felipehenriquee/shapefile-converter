export type FieldInfo = { name: string; example: string; unique: boolean };

/** Every attribute of the layer, with an example value and whether its values are unique. */
export function describeFields(rows: Record<string, unknown>[]): FieldInfo[] {
  const names = new Set<string>();
  for (const row of rows) for (const key of Object.keys(row)) names.add(key);
  return [...names].map((name) => {
    const values = rows.map((row) => row[name]);
    const filled = values.filter((v) => v !== null && v !== undefined && v !== "");
    return {
      name,
      example: filled.length ? String(filled[0]) : "",
      unique: filled.length === rows.length && new Set(filled.map(String)).size === rows.length,
    };
  });
}

const ID_HINT = /^(cd_?mun|geocod|cod(igo)?_?(ibge|mun)?|ibge|id|code|cd_)/i;
const NAME_HINT = /^(nm_?mun|nome|name|nm_|municipio)/i;

/** Best guess for the identifier field: a unique field that looks like a code. */
export function guessIdField(fields: FieldInfo[]) {
  return (
    fields.find((f) => f.unique && ID_HINT.test(f.name)) ??
    fields.find((f) => f.unique && /^\d+$/.test(f.example)) ??
    fields.find((f) => f.unique)
  )?.name;
}

/** Best guess for the name field: a text field that looks like a name. */
export function guessNameField(fields: FieldInfo[]) {
  return (
    fields.find((f) => NAME_HINT.test(f.name) && /[a-z]/i.test(f.example)) ??
    fields.find((f) => f.unique && /[a-z]{3}/i.test(f.example))
  )?.name;
}

export function fieldValue(properties: Record<string, unknown>, field: string | undefined) {
  if (!field) return "";
  const value = properties[field];
  return value === null || value === undefined ? "" : String(value);
}
