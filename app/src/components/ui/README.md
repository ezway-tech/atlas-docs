# Bộ UI Atlas Docs

Dùng component từ `@/components/ui`; màu lấy từ CSS tokens trong `ui.css` và `globals.css`. Đây là cấu trúc shadcn/Radix được điều chỉnh cho CSS hiện tại, không dùng Tailwind. Không tự dựng lại dropdown, hộp thoại hoặc dùng `window.prompt/confirm/alert`.

```tsx
import {Button,Field,Input,Select,Dialog,NumberInput} from '@/components/ui';
<Field label="Tên"><Input value={name} onChange={e=>setName(e.target.value)}/></Field>
<Button variant="primary" disabled={busy} onClick={save}>Lưu</Button>
<Select label="Trạng thái" value={status} onValueChange={setStatus}
  options={[{value:'all',label:'Tất cả'},{value:'done',label:'Hoàn tất'}]}/>
<Dialog title="Sửa thông tin" open={open} onOpenChange={setOpen} busy={busy}>
  <div className="modal">Nội dung và các nút thao tác</div>
</Dialog>
<NumberInput aria-label="Cỡ chữ" value={size} onValueChange={setSize} min={12} max={72}/>
```

## Chọn component

- **Button / IconButton**: primary, secondary, ghost, danger; size sm/md/lg. IconButton cần `label`. Button không truyền variant giữ kiểu của vùng chứa, hỗ trợ các class cũ khi chuyển đổi. Input/Textarea chuyển tiếp props và ref DOM. Field nối label, mô tả và lỗi với input.
- **Select / Slider / NumberInput / ColorPicker**: dùng `value`, `onValueChange`. Select không có option value rỗng (dùng placeholder). Slider cần label và min/max; truyền disabled khi nằm trong fieldset khóa. NumberInput cho phép sửa bản nháp, Enter/blur chốt số và giới hạn, phím lên/xuống thay đổi theo step. ColorPicker lưu HEX 6 chữ số, có bảng màu và vùng chọn màu.
- **Dialog / Sheet / ConfirmDialog**: children của Dialog/Sheet là một phần tử bao nội dung. Không bọc thêm backdrop hoặc tự giữ Tab. Mặc định click ngoài không đóng; `closeOnOutside` bật khi phù hợp. `busy` chặn đóng; `onEscape` dành cho luồng xác nhận bỏ bản nháp. ConfirmDialog mặc định focus Hủy và gọi callback, không gọi API.
- **DropdownMenu / ContextMenu / MenuItem / Popover / Tooltip**: thư viện xử lý bàn phím, portal và va chạm mép màn hình. ContextMenu nhận tọa độ x/y của chuột hoặc nút dấu ba chấm. Tooltip hỗ trợ onlyOverflow cho chữ bị cắt; Ellipsis là cách dùng ngắn.
- **Tabs** dùng khi chuyển panel nội dung; **ToggleGroup** khi chọn một bộ lọc/chế độ; **Collapsible** khi mở/thu gọn nội dung, `defaultOpen` chỉ dùng lúc khởi tạo.
- **Toast** nhận message/onClose; đặt key theo thông báo để bắt đầu lại thời gian. **MediaPlayer** nhận src/kind/label, không tự phát; dùng audio/video HTML bên dưới nhưng điều khiển do app quản lý. LinkDialog là bộ ghép riêng cho Tiptap, không phải primitive chung.

## Focus và phím tắt

Popup dùng `data-ui-popup`, modal dùng `data-ui-dialog`; KeymapProvider nhường Escape cho Radix để chỉ đóng lớp trên cùng. Hộp nhập liên kết/xác nhận dùng `data-ui-block-shortcuts` để không chạy lệnh của màn hình phía sau. Không thêm bộ bắt Escape hoặc Tab thứ hai. Giữ callback kiểm tra thay đổi chưa lưu trong nghiệp vụ.

## Ngoại lệ và kiểm tra

Giữ hộp chọn tệp hệ điều hành qua input file ẩn. UI nội bộ PDF, Swagger, CodeMirror và Tiptap thuộc thư viện chuyên dụng; không thay node DOM của chúng. Không thay schema hoặc API backend.

Chạy `npm run typecheck`, `npm run build`, `npm run test:ui`. Kiểm thử UI chạy server fixture riêng ở 127.0.0.1:3107, dùng Edge headless, API giả lập và tệp WAV cục bộ có hỗ trợ Range; không sửa dữ liệu thật. Ảnh kiểm tra nằm trong test-results/. Các trạng thái cần kiểm tra: sáng/tối, màn hình hẹp, Tab/Shift+Tab/Escape, dropdown lồng trong dialog, lưu/hủy/gỡ link, giới hạn số, sửa ảnh/hoàn tác/xác nhận và phát media.
