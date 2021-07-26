#!/usr/bin/env deno run --allow-run --allow-read --allow-write
import { join } from "https://deno.land/std/path/mod.ts";

interface Config {
  appName: string;
  s3Bucket: string;
  s3Prefix: string;
  redirectUri: string;
  region?: string;
}

namespace Paths {
  export const denoDir = ".deno_dir";
  export const dist = "dist";
  export const main = "main.ts";
  export const mainDist = join(dist, main);

  export const gen = join(dist, denoDir, "gen");
  export const mainGen = (cwd: string) => join(gen, "file", cwd, dist);
  export const lambdaRootGen = join(dist, denoDir, "LAMBDA_TASK_ROOT");

  export const distZip = `${dist}.zip`;
}

const required: Array<keyof Config> = [
  "appName",
  "s3Bucket",
  "s3Prefix",
  "redirectUri",
];
const confFiles = [
  "config.json",
  "config.local.json",
];
const capabilities = ["CAPABILITY_IAM", "CAPABILITY_AUTO_EXPAND"];

const fileExists = async (file: string): Promise<boolean> => {
  try {
    const stat = await Deno.stat(file);
    return stat.isFile;
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      return false;
    }

    throw err;
  }
};

const tryRemove = async (path: string): Promise<boolean> => {
  try {
    await Deno.remove(path, { recursive: true });
    return true;
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      return false;
    }

    throw err;
  }
};

const readConf = async (file: string): Promise<Partial<Config>> => {
  const text = await Deno.readTextFile(file);
  return JSON.parse(text);
};

const readTransientConf = async (
  file: string,
): Promise<Partial<Config> | undefined> => {
  if (await fileExists(file)) {
    return readConf(file);
  } else {
    return undefined;
  }
};

const filterUndefined = <T>(val: T | undefined): val is T =>
  typeof val !== "undefined";

const runCmd = async (opts: Deno.RunOptions): Promise<void> => {
  const buildProc = Deno.run(opts);

  if (!(await buildProc.status()).success) {
    console.error("Failed to run cmd", opts.cmd);
    Deno.exit(1);
  }
};

const extractConf = async (): Promise<Config> => {
  const confs = (await Promise.all(
    confFiles.map((c) => readTransientConf(c)),
  )).filter(filterUndefined);

  if (confs.length === 0) {
    console.error("No config files found");
    console.error("At least one of the following files needs to exist:");
    for (const confFile of confFiles) {
      console.error(`\t${confFile}`);
    }
    Deno.exit(1);
  }

  const tconf = confs.reduce((prev, curr) => ({ ...prev, ...curr }));
  const { appName, s3Bucket, s3Prefix, redirectUri, ...extraConf } = tconf;

  if (!appName || !s3Bucket || !s3Prefix || !redirectUri) {
    console.error("Not all required values defined in configs");
    console.error("Missing values:");
    const existingValues = new Set(Object.keys(tconf));
    for (
      const req of required.filter((r) => !existingValues.has(r) || !tconf[r])
    ) {
      console.error(`\t${req}`);
    }
    Deno.exit(1);
  }

  return {
    appName,
    s3Bucket,
    s3Prefix,
    redirectUri,
    ...extraConf,
  };
};

const buildLambda = async (): Promise<void> => {
  await Promise.all([tryRemove(Paths.dist), tryRemove(Paths.distZip)]);
  await Deno.mkdir(Paths.dist, { recursive: true });
  await Deno.copyFile(Paths.main, Paths.mainDist);
  await runCmd({
    cmd: ["deno", "cache", Paths.main],
    cwd: Paths.dist,
    env: {
      DENO_DIR: Paths.denoDir,
    },
  });
  await runCmd(
    { cmd: ["cp", "-R", Paths.mainGen(Deno.cwd()), Paths.lambdaRootGen] },
  );
  await runCmd(
    {
      cmd: ["zip", "-r", join("..", Paths.distZip), "."],
      cwd: join(Deno.cwd(), Paths.dist),
    },
  );
};

const deployLambda = async (
  { appName, s3Bucket, s3Prefix, redirectUri, region }: Config,
): Promise<void> => {
  const cmd = [
    "sam",
    "deploy",
    "--stack-name",
    appName,
    "--s3-bucket",
    s3Bucket,
    "--s3-prefix",
    s3Prefix,
    "--capabilities",
    ...capabilities,
    "--parameter-overrides",
    `ParameterKey=RedirectUri,ParameterValue=${redirectUri}`,
  ];

  if (region) {
    cmd.push("--region", region);
  }

  await runCmd({
    cmd,
  });

  console.log("Deployed lambda");
};

const cnf = await extractConf();
await buildLambda();
await deployLambda(cnf);
