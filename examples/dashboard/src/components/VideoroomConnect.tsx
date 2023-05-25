import React, { FC, useState } from "react";
import axios from "axios";
import { CopyToClipboardButton } from "./CopyButton";
import { getStringValue } from "./LogSelector";
import { saveString } from "../utils/localStorageUtils";

type Props = {
  refetchIfNeeded: () => void;
};

const FIELD_ID = "videoroom-room-name";

export const VideoroomConnect: FC<Props> = ({ refetchIfNeeded }) => {
  const [state, setState] = useState<string>(getStringValue(FIELD_ID) || "");
  const [tokens, setTokens] = useState<string[]>([]);

  return (
    <div className="flex m-2 card bg-base-100 shadow-xl w-[400px]">
      <div className="card-body">
        <div className="flex flex-col">
          <span className="card-title"></span>
          <div className="form-control m-1 flex flex-row items-center">
            <input
              type="text"
              placeholder="Type here"
              className="input input-bordered w-full"
              value={state}
              onChange={(event) => {
                setState(event.target.value);
                saveString(FIELD_ID, event.target.value);
              }}
            />
            <div className="tooltip tooltip-bottom w-[32px] h-full m-2" data-tip="Videroom room name">
              <svg
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z"
                ></path>
              </svg>
            </div>
          </div>
          <button
            disabled={state === ""}
            className={`btn btn-sm btn-success mx-1 my-1`}
            onClick={() => {
              axios
                .get(`http://localhost:4002/api/room/${state}`)
                .then((respo) => {
                  const token = respo.data.data.token;
                  if (token) {
                    setTokens((prevState) => [...prevState, token]);
                  }
                  refetchIfNeeded();
                })
                .catch((error) => {
                  console.error(error);
                });
            }}
          >
            Connect
          </button>
          <div>
            {tokens.map((token) => {
              return (
                <div key={token}>
                  <span className="break-words text-xs">{token}</span>
                  <CopyToClipboardButton text={token} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
