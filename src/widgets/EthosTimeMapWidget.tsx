import { Text } from "@expo/ui/swift-ui";
import { createWidget } from "expo-widgets";

export type TimeMapWidgetBox = {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  breakDurations: number[];
  color: string;
  completed: boolean;
};

export type TimeMapWidgetAvailableRange = {
  start: number;
  duration: number;
  fullLabel: string;
  compactLabel: string;
};

export type TimeMapWidgetProps = {
  date: string;
  durationLabel: string;
  mapLabel: string;
  backgroundColor: string;
  foregroundColor: string;
  mutedColor: string;
  isDark: boolean;
  boxes: TimeMapWidgetBox[];
  availableRanges: TimeMapWidgetAvailableRange[];
};

function TimeMapWidgetBridge() {
  "widget";
  // The config plugin replaces this widget's generated entry view with native SwiftUI.
  return <Text>Time Map</Text>;
}

export default createWidget<TimeMapWidgetProps>("EthosTimeMapWidget", TimeMapWidgetBridge);
