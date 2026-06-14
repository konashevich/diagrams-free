import {
  CaptureUpdateAction,
  getContainerElement,
  isTextElement,
  refreshTextDimensions,
} from "@excalidraw/element";
import { Fonts } from "@excalidraw/excalidraw";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

/** Load scene fonts and refresh text metrics (vault open bypasses App.initializeScene). */
export const ensureSceneFontsApplied = async (
  api: ExcalidrawImperativeAPI,
): Promise<void> => {
  const elements = api.getSceneElementsIncludingDeleted();
  if (elements.length === 0) {
    return;
  }

  await Fonts.loadElementsFonts(elements);

  const elementsMap = api.getSceneElementsMapIncludingDeleted();
  let hasText = false;
  const refreshed = elements.map((element) => {
    if (!isTextElement(element)) {
      return element;
    }
    hasText = true;
    return {
      ...element,
      ...refreshTextDimensions(
        element,
        getContainerElement(element, elementsMap),
        elementsMap,
      ),
    };
  });

  if (!hasText) {
    return;
  }

  api.updateScene({
    elements: refreshed,
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
};
