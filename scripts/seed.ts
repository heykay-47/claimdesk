import "./env";
import { resetDemo } from "../seed/run";

resetDemo()
  .then((result) => console.log(result))
  .catch(() => {
    console.error(
      "Seed failed. Check DB connectivity, private Blob access and bundled seed files.",
    );
    process.exitCode = 1;
  });
