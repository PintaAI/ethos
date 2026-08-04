export type TimeInputProps = {
  value: string;
  onChange: (value: string) => void;
  active: boolean;
  onPress: () => void;
  accessibilityLabel: string;
};

export type NativeTimeWheelProps = {
  value: string;
  onChange: (value: string) => void;
};
