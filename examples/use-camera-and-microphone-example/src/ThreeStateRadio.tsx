export type Props = {
  set: (value: undefined | boolean) => void;
  value: undefined | boolean;
  name: string;
  radioClass?: string;
};

export const ThreeStateRadio = ({ set, value, name, radioClass }: Props) => {
  return (
    <div className="flex flex-row gap-1 items-center">
      <div className="form-control">
        <label className="label cursor-pointer">
          <span className="label-text mr-1">undefined</span>
          <input
            type="radio"
            name={name}
            className={`radio ${radioClass ?? ""}`}
            onChange={() => {
              set(undefined);
            }}
            checked={value === undefined}
          />
        </label>
      </div>

      <div className="form-control">
        <label className="label cursor-pointer">
          <span className="label-text mr-1">true</span>
          <input
            type="radio"
            name={name}
            className={`radio ${radioClass ?? ""}`}
            onChange={() => {
              set(true);
            }}
            checked={value === true}
          />
        </label>
      </div>

      <div className="form-control">
        <label className="label cursor-pointer">
          <span className="label-text mr-1">false</span>
          <input
            type="radio"
            name={name}
            className={`radio ${radioClass ?? ""}`}
            onChange={() => {
              set(false);
            }}
            checked={value === false}
          />
        </label>
      </div>
      <span>{name}</span>
    </div>
  );
};
