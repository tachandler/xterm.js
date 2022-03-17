/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableDomListener } from 'browser/Lifecycle';
import { IRenderService } from 'browser/services/Services';
import { Disposable } from 'common/Lifecycle';
import { IBufferService, IDecorationService, IInternalDecoration, IOptionsService } from 'common/services/Services';

// This is used to reduce memory usage
// when refreshStyle is called
// by storing and updating
// the sizes of the decorations to be drawn
const renderSizes = new Uint16Array(3);
const enum SizeIndex {
  OUTER_SIZE = 0,
  INNER_SIZE = 1
}

export class OverviewRulerRenderer extends Disposable {
  private readonly _canvas: HTMLCanvasElement;
  private readonly _ctx: CanvasRenderingContext2D;
  private readonly _decorationElements: Map<IInternalDecoration, HTMLElement> = new Map();
  private get _width(): number {
    return this._optionsService.options.overviewRulerWidth || 0;
  }
  private _animationFrame: number | undefined;

  constructor(
    private readonly _viewportElement: HTMLElement,
    private readonly _screenElement: HTMLElement,
    @IBufferService private readonly _bufferService: IBufferService,
    @IDecorationService private readonly _decorationService: IDecorationService,
    @IRenderService private readonly _renderService: IRenderService,
    @IOptionsService private readonly _optionsService: IOptionsService
  ) {
    super();
    this._canvas = document.createElement('canvas');
    this._canvas.classList.add('xterm-decoration-overview-ruler');
    this._viewportElement.parentElement?.insertBefore(this._canvas, this._viewportElement);
    const ctx = this._canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Ctx cannot be null');
    } else {
      this._ctx = ctx;
    }
    this._queueRefresh(true);
    this.register(this._bufferService.buffers.onBufferActivate(() => {
      this._canvas!.style.display = this._bufferService.buffer === this._bufferService.buffers.alt ? 'none' : 'block';
    }));
    this.register(this._renderService.onRenderedBufferChange(() => this._queueRefresh()));
    this.register(this._renderService.onDimensionsChange(() => this._queueRefresh(true, true)));
    this.register(addDisposableDomListener(window, 'resize', () => this._queueRefresh(true)));
    this.register(this._decorationService.onDecorationRegistered(() => this._queueRefresh(undefined, true)));
    this.register(this._decorationService.onDecorationRemoved(decoration => this._removeDecoration(decoration)));
    this.register(this._optionsService.onOptionChange(o => {
      if (o === 'overviewRulerWidth') {
        renderSizes[SizeIndex.OUTER_SIZE] = Math.floor(this._width / 3);
        renderSizes[SizeIndex.INNER_SIZE] = Math.ceil(this._width / 3);
        this._queueRefresh();
      }
    }));
    renderSizes[SizeIndex.OUTER_SIZE] = Math.floor(this._width / 3);
    renderSizes[SizeIndex.INNER_SIZE] = Math.ceil(this._width / 3);
  }

  public override dispose(): void {
    for (const decoration of this._decorationElements) {
      this._ctx?.clearRect(
        0,
        Math.round(this._canvas.height * (decoration[0].marker.line / this._bufferService.buffers.active.lines.length)),
        this._canvas.width,
        window.devicePixelRatio
      );
    }
    this._decorationElements.clear();
    this._canvas?.remove();
    super.dispose();
  }

  private _refreshStyle(decoration: IInternalDecoration, updateAnchor?: boolean): void {
    if (updateAnchor) {
      if (decoration.options.anchor === 'right') {
        this._canvas.style.right = decoration.options.x ? `${decoration.options.x * this._renderService.dimensions.actualCellWidth}px` : '';
      } else {
        this._canvas.style.left = decoration.options.x ? `${decoration.options.x * this._renderService.dimensions.actualCellWidth}px` : '';
      }
    }
    if (!decoration.options.overviewRulerOptions) {
      this._decorationElements.delete(decoration);
      return;
    }
    this._ctx.lineWidth = 1;
    this._ctx.fillStyle = decoration.overviewRulerOptions?.color || decoration.options.overviewRulerOptions.color;
    this._ctx.fillRect(
      !decoration.options.overviewRulerOptions.position ||  decoration.options.overviewRulerOptions.position === 'left' ? 0 : decoration.options.overviewRulerOptions.position === 'right' ? renderSizes[SizeIndex.OUTER_SIZE] + renderSizes[SizeIndex.INNER_SIZE]: renderSizes[SizeIndex.OUTER_SIZE],
      Math.round(this._canvas.height * (decoration.options.marker.line / this._bufferService.buffers.active.lines.length)),
      !decoration.options.overviewRulerOptions.position ? this._width : decoration.options.overviewRulerOptions.position === 'center' ? renderSizes[SizeIndex.INNER_SIZE] : renderSizes[SizeIndex.OUTER_SIZE],
      // when a position is provided, the element has less width, so increase its height
      window.devicePixelRatio * (decoration.options.overviewRulerOptions.position ? 6 : 2)
    );
  }

  private _refreshDecorations(updateCanvasDimensions?: boolean, updateAnchor?: boolean): void {
    if (updateCanvasDimensions) {
      this._canvas.style.width = `${this._width}px`;
      this._canvas.style.height = `${this._screenElement.clientHeight}px`;
      this._canvas.width = Math.floor((this._width)* window.devicePixelRatio);
      this._canvas.height = Math.floor(this._screenElement.clientHeight * window.devicePixelRatio);
    }
    this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    for (const decoration of this._decorationService.decorations) {
      this._renderDecoration(decoration, updateAnchor);
    }
  }

  private _renderDecoration(decoration: IInternalDecoration, updateAnchor?: boolean): void {
    const element = this._decorationElements.get(decoration);
    if (!element) {
      this._decorationElements.set(decoration, this._canvas);
    }
    this._refreshStyle(decoration, updateAnchor);
  }

  private _queueRefresh(updateCanvasDimensions?: boolean, updateAnchor?: boolean): void {
    if (this._animationFrame !== undefined) {
      return;
    }
    this._animationFrame = window.requestAnimationFrame(() => {
      this._refreshDecorations(updateCanvasDimensions, updateAnchor);
      this._animationFrame = undefined;
    });
  }

  private _removeDecoration(decoration: IInternalDecoration): void {
    this._decorationElements.get(decoration)?.remove();
    this._decorationElements.delete(decoration);
  }
}
