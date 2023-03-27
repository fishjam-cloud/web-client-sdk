import React from "react";

export const JsonComponent = ({ state }: { state: any }) => {
  return (
    <div className="mockup-code">
      <small>
        <pre>
          <code>
            {JSON.stringify(
              state,
              (key, value) => {
                if (typeof value === "bigint") return value.toString();
                return value;
              },
              2
            )}
          </code>
        </pre>
      </small>
    </div>
  );
};
