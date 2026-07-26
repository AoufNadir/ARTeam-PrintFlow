"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.designNameFromAsset = designNameFromAsset;
function designNameFromAsset(asset) {
    const base = asset.fileName.replace(/\.[^.]+$/, '').trim() || 'تصميم';
    return asset.pageCount && asset.pageCount > 1 ? `${base} — صفحة ${asset.pageNumber}` : base;
}
