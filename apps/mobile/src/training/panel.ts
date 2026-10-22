import { StyleSheet, type ViewStyle } from "react-native";
import { styles } from "@/components/ui";
// The game panel fills a fixed scene. Catalogue/session panels size to their
// content inside a ScrollView, so they must not inherit its flex basis.
const panel: ViewStyle = { ...StyleSheet.flatten(styles.panel) };
delete panel.flex;
export const trainingPanel = panel;
