import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

/** Restore natural Vietnamese labels that match the former hard-coded UI. */
const fixes={
 'mediaPlayer.play':'Phát',
 'mediaPlayer.pause':'Tạm dừng',
 'mediaPlayer.position':'Vị trí phát',
 'mediaPlayer.muteOn':'Bật tiếng',
 'mediaPlayer.muteOff':'Tắt tiếng',
 'mediaPlayer.volume':'Âm lượng',
 'mediaPlayer.speed':'Tốc độ phát',
 'mediaPlayer.fullscreen':'Toàn màn hình',
 'mediaPlayer.cannotPlay':'Không thể phát tệp này.',
 'mediaPlayer.loadError':'Không thể tải hoặc định dạng không được hỗ trợ.',
 'mediaPlayer.fullscreenFailed':'Không thể mở toàn màn hình.',
 'mediaPlayer.loading':'Đang tải…',
 'preview.zoom.title':'Phóng to',
 'preview.zoom.fit':'Vừa khung',
 'preview.zoom.zoomIn':'Phóng lớn',
 'preview.zoom.zoomOut':'Thu nhỏ',
 'preview.zoom.fullscreen':'Toàn màn hình',
 'preview.zoom.medium':'Khung vừa',
 'preview.zoom.scaleAria':'Tỷ lệ phóng to',
 'imageEditor.color':'Màu',
 'link.dialog.title':'Địa chỉ liên kết',
 'link.dialog.remove':'Gỡ liên kết',
 'link.dialog.invalid':'Liên kết không hợp lệ.',
 'keymap.dialog.title':'Phím tắt',
 'keymap.change':'Đổi',
 'resources.filter.type':'Loại tệp',
 'resources.filter.origin':'Nguồn / tình trạng',
 'resources.filter.title':'Bộ lọc',
 'resources.type.image':'Ảnh',
 'resources.source.upload':'Tải lên',
 'resources.detail.editImageBtn':'Sửa ảnh',
 'resources.detail.delete':'Xóa tệp',
 'resources.delete.title':'Xóa tệp này?',
 'resources.detail.title':'Chi tiết tài nguyên',
 'imageEditor.save.overwrite':'Lưu đè ảnh này',
 'imageEditor.undo':'Hoàn tác',
 'imageEditor.redo':'Làm lại',
 'imageEditor.discard.title':'Bỏ thay đổi ảnh?',
 'imageEditor.canvasAria':'Vùng vẽ trên ảnh',
 'common.discardChanges':'Bỏ thay đổi',
 'common.done':'Xong',
 'common.hexColor':'Mã màu HEX',
 'common.choose':'Chọn…',
 'editor.format.link':'Liên kết',
 'storage.cleanup.historyInUse':'Đang dùng trong lịch sử ({count})',
 'storage.delete.failed':'Không xóa được {count}.',
 'history.preview.noneOverLimit':'Không có phiên bản vượt giới hạn.',
 'storage.refresh':'Cập nhật dung lượng',
 'storage.viewDetails':'Xem chi tiết',
 'storage.confirm.delete.body':'Xóa {count} tệp, khoảng {bytes}. Không thể hoàn tác. Tệp có thể còn được dùng trong bản nháp chưa lưu.',
 'reader.zoomDiagramFullscreen':'Xem sơ đồ toàn màn hình',
 'utilities.menu.label':'Tiện ích',
 'utilities.menu.storage':'Dung lượng & dọn dẹp',
 'utilities.menu.backup':'Sao lưu & khôi phục',
 'utilities.menu.keymap':'Phím tắt',
 'utilities.menu.attachments':'Tệp đính kèm',
 'storage.tabs.files':'Dọn tệp',
 'storage.tabs.history':'Lịch sử',
 'storage.files.intro':'Tìm tệp có thể xóa để giải phóng dung lượng. Bạn chọn trước khi xóa.',
 'storage.inUse':'Đang dùng',
 'storage.scan.run':'Kiểm tra tệp',
 'storage.dialog.title':'Dung lượng & dọn dẹp',
 'backup.dialog.title':'Sao lưu & khôi phục',
 'common.close':'Đóng',
 'common.cancel':'Hủy',
 'common.confirm':'Xác nhận',
 'common.save':'Lưu',
};

const file=path.join(path.dirname(fileURLToPath(import.meta.url)),'..','src','lib','i18n','messages','vi.ts');
let src=fs.readFileSync(file,'utf8');
for(const [key,value] of Object.entries(fixes)){
 const line=` ${JSON.stringify(key)}:${JSON.stringify(value)},`;
 if(!src.includes(JSON.stringify(key))){
  src=src.replace(/\n\};\n\nexport default messages;\n$/,`\n${line}\n};\n\nexport default messages;\n`);
 }else{
  src=src.replace(new RegExp(` ${JSON.stringify(key)}:[^,\\n]+,`),line);
 }
}
fs.writeFileSync(file,src);
console.log('fixed',Object.keys(fixes).length,'vi UI strings');
