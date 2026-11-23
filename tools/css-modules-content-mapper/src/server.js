// @ts-check
// TypeScript 7 content mapper server (JSON-RPC over stdio).
// Protocol: microsoft/typescript-go#4712, revised by microsoft/TypeScript#63936.
import { ErrorCodes, ResponseError, createMessageConnection } from "vscode-jsonrpc";
import { StreamMessageReader, StreamMessageWriter } from "vscode-jsonrpc/node";
import { transformCss } from "./transform.js";

const POSITION_ENCODING = "utf-16";

const connection = createMessageConnection(
  new StreamMessageReader(process.stdin),
  new StreamMessageWriter(process.stdout),
);

connection.onRequest(
  "initialize",
  (/** @type {{ protocolVersion?: number; positionEncodings: string[] }} */ params) => {
    if (!params.positionEncodings.includes(POSITION_ENCODING)) {
      throw new ResponseError(
        ErrorCodes.InvalidParams,
        `css-modules-content-mapper requires the ${POSITION_ENCODING} position encoding`,
      );
    }
    return {
      // older builds require echoing protocolVersion; newer ones ignore it
      ...(params.protocolVersion === undefined ? {} : { protocolVersion: params.protocolVersion }),
      positionEncoding: POSITION_ENCODING,
      diagnosticSource: "css-modules",
    };
  },
);
connection.onRequest("openProject", () => ({}));
connection.onRequest("closeProject", () => undefined);
connection.onRequest("transform", transformCss);
connection.listen();
