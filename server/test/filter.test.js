// Phép thử lọc từ: chạy bằng `node --test test/` trong thư mục server/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { censor, stripAccents, canon } from '../src/filter.js';

test('bỏ dấu tiếng Việt, đ thành d', () => {
  assert.equal(stripAccents('Đường Đà Nẵng, trường Thái Phiên'), 'Duong Da Nang, truong Thai Phien');
});

test('từ tục có dấu bị thay bằng ***, phần còn lại giữ nguyên', () => {
  assert.deepEqual(censor('thằng này địt mẹ thật'), { text: 'thằng này *** mẹ thật', hit: true });
  assert.equal(censor('cái lồn gì thế').text, 'cái *** gì thế');
  assert.equal(censor('Đéo hiểu').text, '*** hiểu');
});

test('dạng không dấu, viết tắt, viết hoa đều bị bắt', () => {
  for (const w of ['dit', 'DIT', 'dm', 'ĐM', 'đmm', 'vcl', 'VCL', 'vl', 'dcm', 'loz', 'l0n']) assert.equal(censor(`a ${w} b`).text, 'a *** b', w);
});

test('chen dấu câu, kéo dài chữ, đổi số thành chữ vẫn bị bắt', () => {
  for (const w of ['đ.m', 'd-i-t', 'f.u.c.k', 'fuuuuck', 'sh1t', 'b1tch', 'diiiit', 'vcllll', 'địtttt']) assert.equal(censor(w).text, '***', w);
});

test('tiếng Anh: từ lẻ và tiền tố', () => {
  for (const w of ['fuck', 'Fucking', 'motherfucker', 'shit', 'bitches', 'nigga']) assert.equal(censor(`x ${w}`).text, 'x ***', w);
});

test('cụm hai từ không dấu', () => {
  assert.equal(censor('may la con cac a').text, 'may la *** *** a');
});

test('KHÔNG chặn nhầm tiếng Việt không dấu thông thường và từ gần giống', () => {
  const clean = [
    'cac ban oi ra san truong di', 'buoi sang nay dep qua', 'mua lon bia', 'deo kinh vao', 'di du lich', 'cho minh xin diem danh',
    'các bạn ơi', 'buổi họp lớp', 'lớn rồi', 'đeo kính', 'phó chủ tịch', 'điểm mười', 'cắt cỏ', 'cút bắt', 'hello class', 'pho bo',
    'Thái Phiên 12A1 khoá 2001–2004', 'lớp mình chụp ảnh ở cột cờ nhé!', 'assignment', 'dich vu', 'ditto',
  ];
  for (const s of clean) assert.deepEqual(censor(s), { text: s, hit: false }, s);
});

test('giữ nguyên khoảng trắng và dấu câu quanh từ sạch', () => {
  assert.equal(censor('ừ,  vcl  thật!').text, 'ừ,  ***  thật!');
});
