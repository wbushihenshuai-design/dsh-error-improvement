/** Filesystem layout shared by every module of the plugin. */
export declare function dshHome(): string;
/** Root of the md-native memory layer: lessons.md / recipes.md / decisions.md. */
export declare function memoryRoot(): string;
export declare function memoryFile(kind: "lessons" | "recipes" | "decisions"): string;
/** Pending user-confirmation drafts produced by distillation / graduation. */
export declare function draftsRoot(): string;
/** Append-only raw capture queue consumed by the distiller. */
export declare function candidatesFile(): string;
export declare function skillsRoot(): string;
export declare function legacySettingsYaml(): string;
export declare function legacyStateFile(): string;
