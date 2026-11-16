export interface QualityApi {
  exec(
    command: string,
    args: string[],
    options: { cwd: string },
  ): Promise<{ code: number; stdout: string; stderr: string }>;
}
