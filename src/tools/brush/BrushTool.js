import external from './../../externalModules.js';
import BaseBrushTool from './../base/BaseBrushTool.js';
import {
  getToolState,
  addToolState,
} from './../../stateManagement/toolState.js';
import store from './../../store/index.js';
import brushUtils from './../../util/brush/index.js';
import EVENTS from '../../events';

const { drawBrushPixels, getCircle } = brushUtils;
const { state } = store.modules.brush;

/**
 * @public
 * @class BrushTool
 * @memberof Tools.Brush
 * @classdesc Tool for drawing segmentations on an image.
 * @extends Tools.Base.BaseBrushTool
 */
export default class BrushTool extends BaseBrushTool {
  constructor(configuration = {}) {
    const defaultConfig = {
      name: 'Brush',
      supportedInteractionTypes: ['Mouse'],
      strategies: {
        overlapping: _overlappingStrategy,
        nonOverlapping: _nonOverlappingStrategy,
      },
      defaultStrategy: 'overlapping',
      configuration: {},
    };
    const initialConfiguration = Object.assign(defaultConfig, configuration);

    super(initialConfiguration);

    this.initialConfiguration = initialConfiguration;
  }

  /**
   * Called by the event dispatcher to render the image.
   *
   * @param {Object} evt - The event.
   */
  renderBrush(evt) {
    const eventData = evt.detail;
    const viewport = eventData.viewport;

    let mousePosition;

    if (this._drawing) {
      mousePosition = this._lastImageCoords;
    } else if (this._mouseUpRender) {
      mousePosition = this._lastImageCoords;
      this._mouseUpRender = false;
    } else {
      mousePosition = store.state.mousePositionImage;
    }

    if (!mousePosition) {
      return;
    }

    const { rows, columns } = eventData.image;
    const { x, y } = mousePosition;

    if (x < 0 || x > columns || y < 0 || y > rows) {
      return;
    }

    // Draw the hover overlay on top of the pixel data
    const configuration = this._configuration;
    const radius = state.radius;
    const context = eventData.canvasContext;
    const element = eventData.element;
    const drawId = state.drawColorId;
    const color = this._getBrushColor(drawId);

    context.setTransform(1, 0, 0, 1, 0, 0);

    const { cornerstone } = external;

    const circleRadius = radius * viewport.scale;
    const mouseCoordsCanvas = cornerstone.pixelToCanvas(element, mousePosition);

    context.beginPath();
    context.strokeStyle = color;
    context.ellipse(
      mouseCoordsCanvas.x,
      mouseCoordsCanvas.y,
      circleRadius,
      circleRadius,
      0,
      0,
      2 * Math.PI
    );
    context.stroke();
  }

  /**
   * Paints the data to the canvas.
   *
   * @private
   * @param  {Object} eventData The data object associated with the event.
   */
  _paint(evt) {
    this.applyActiveStrategy(evt, this.configuration);

    external.cornerstone.triggerEvent(
      evt.detail.element,
      EVENTS.MEASUREMENT_MODIFIED,
      evt.detail
    );

    external.cornerstone.updateImage(evt.detail.element);
  }
}

function _overlappingStrategy(evt, configuration) {
  const eventData = evt.detail;
  const element = eventData.element;
  const { rows, columns } = eventData.image;
  const { x, y } = eventData.currentPoints.image;
  let toolState = getToolState(
    element,
    BaseBrushTool.getReferencedToolDataName()
  );

  if (!toolState) {
    addToolState(element, BaseBrushTool.getReferencedToolDataName(), {});
    toolState = getToolState(
      element,
      BaseBrushTool.getReferencedToolDataName()
    );
  }

  const toolData = toolState.data;

  if (x < 0 || x > columns || y < 0 || y > rows) {
    return;
  }

  const radius = state.radius;
  const pointerArray = getCircle(radius, rows, columns, x, y);

  _drawMainColor(eventData, toolData, pointerArray);
}

function _nonOverlappingStrategy(evt, configuration) {
  const eventData = evt.detail;
  const element = eventData.element;
  const { rows, columns } = eventData.image;
  const { x, y } = eventData.currentPoints.image;

  let toolState = getToolState(
    element,
    BaseBrushTool.getReferencedToolDataName()
  );

  if (!toolState) {
    addToolState(element, BaseBrushTool.getReferencedToolDataName(), {});
    toolState = getToolState(
      element,
      BaseBrushTool.getReferencedToolDataName()
    );
  }

  const toolData = toolState.data;
  const segmentationIndex = state.drawColorId;

  if (x < 0 || x > columns || y < 0 || y > rows) {
    return;
  }

  const radius = state.radius;
  const pointerArray = getCircle(radius, rows, columns, x, y);

  const numberOfColors = BaseBrushTool.getNumberOfColors();

  // If there is brush data in this region for other colors, delete it.
  for (let i = 0; i < numberOfColors; i++) {
    if (i === segmentationIndex) {
      continue;
    }

    if (toolData[i] && toolData[i].pixelData) {
      drawBrushPixels(pointerArray, toolData[i].pixelData, columns, true);
      toolData[i].invalidated = true;
    }
  }

  _drawMainColor(eventData, toolData, pointerArray);
}

function _drawMainColor(eventData, toolData, pointerArray) {
  const shouldErase = _isCtrlDown(eventData);
  const columns = eventData.image.columns;
  const segmentationIndex = state.drawColorId;

  if (shouldErase && !toolData[segmentationIndex]) {
    // Erase command, yet no data yet, just return.
    return;
  }

  if (!toolData[segmentationIndex]) {
    toolData[segmentationIndex] = {};
  }

  if (!toolData[segmentationIndex].pixelData) {
    toolData[segmentationIndex].pixelData = new Uint8ClampedArray(
      eventData.image.width * eventData.image.height
    );
  }

  const pixelData = toolData[segmentationIndex].pixelData;

  // Draw / Erase the active color.
  drawBrushPixels(pointerArray, pixelData, columns, shouldErase);

  toolData[segmentationIndex].invalidated = true;
}

function _isCtrlDown(eventData) {
  return (eventData.event && eventData.event.ctrlKey) || eventData.ctrlKey;
}
