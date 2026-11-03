import { useId } from "react";
import { Modal } from "antd";
import { RADAR_FORMULA_NOTE } from "../radar/radarUtils";
import arenaBackground from "../../assets/background/stadium.jpg";
import { MDI, MdiIcon } from "./mdi";

/**
 * 公开页的说明类弹窗：
 * - GraphCommentDialog：移植 RM Schedule 的 GraphComment.vue（晋级图注释）
 * - AboutDialog：移植 RM Schedule 的 About.vue（关于软件）
 */

const RM_UI_REPO = "https://github.com/scutrobotlab/rm-schedule-ui";

interface DialogFrameProps {
  open: boolean;
  onClose: () => void;
  titleId: string;
  className?: string;
  children: React.ReactNode;
}

// RM 的 v-dialog max-width="480" + 深色 v-card；antd Modal 负责焦点锁定与 Esc 关闭
const DialogFrame = ({
  open,
  onClose,
  titleId,
  className,
  children,
}: DialogFrameProps) => (
  <Modal
    open={open}
    onCancel={onClose}
    footer={null}
    closable={false}
    centered
    width={480}
    rootClassName={`pt-dialog-root${className ? ` ${className}` : ""}`}
    aria-labelledby={titleId}
    destroyOnHidden
  >
    {children}
  </Modal>
);

const DialogClose = ({ onClose }: { onClose: () => void }) => (
  <div className="pt-dialog-actions">
    <button type="button" className="pt-text-btn" onClick={onClose}>
      关闭
    </button>
  </div>
);

interface GraphCommentDialogProps {
  open: boolean;
  onClose: () => void;
}

export const GraphCommentDialog = ({
  open,
  onClose,
}: GraphCommentDialogProps) => {
  const titleId = useId();
  return (
    <DialogFrame open={open} onClose={onClose} titleId={titleId}>
      <div className="pt-dialog-head">
        <h3 className="pt-dialog-title" id={titleId}>
          对阵图注释
        </h3>
        <p className="pt-dialog-subtitle">注释将帮助您更好地理解对阵图</p>
      </div>
      <dl className="pt-comment-list">
        <div>
          <dt>场次块</dt>
          <dd>
            每个方块代表一场比赛，左侧橙色标签为场次号；上方为红方、下方为蓝方。横幅标题标明所属轮次，金色横幅为冠军争夺战。
          </dd>
        </div>
        <div>
          <dt>胜负徽标</dt>
          <dd>
            队名前的数字为比分。比赛结束后胜方徽标点亮为红 /
            蓝色、名称高亮，负方变灰；未开赛显示“-”。
          </dd>
        </div>
        <div>
          <dt>轮空</dt>
          <dd>对手空缺时本场不进行，参赛方直接晋级，徽标显示“轮空晋级”。</dd>
        </div>
        <div>
          <dt>点击 / 长按队伍</dt>
          <dd>
            点击任意一支队伍，将高亮它出现过的所有位置，再次点击取消；此时在右上角“更多”菜单中选择“分析队伍”即可查看队伍分析。手机上长按队伍可直接打开该场比赛的菜单。
          </dd>
        </div>
        <div>
          <dt>实力雷达</dt>
          <dd>{RADAR_FORMULA_NOTE}</dd>
        </div>
      </dl>
      <DialogClose onClose={onClose} />
    </DialogFrame>
  );
};

interface AboutDialogProps {
  open: boolean;
  onClose: () => void;
  siteName: string;
  schoolName: string;
  // 隐藏入口：连续点击校徽（用于看板设置）
  onEmblemClick?: () => void;
}

export const AboutDialog = ({
  open,
  onClose,
  siteName,
  schoolName,
  onEmblemClick,
}: AboutDialogProps) => {
  const titleId = useId();
  return (
    <DialogFrame
      open={open}
      onClose={onClose}
      titleId={titleId}
      className="pt-about-root"
    >
      <div
        className="pt-about-banner"
        style={{ backgroundImage: `url(${arenaBackground})` }}
      >
        <h3 className="pt-dialog-title" id={titleId}>
          关于 {siteName}
        </h3>
        <p className="pt-dialog-subtitle">{schoolName}</p>
      </div>
      <div className="pt-about-body">
        {/* 校徽：非交互装饰，点击只用于隐藏的看板设置入口 */}
        <img
          className="pt-about-emblem"
          src="/school-emblem.svg"
          alt={`${schoolName}校徽`}
          onClick={onEmblemClick}
        />
        <h4>— 系统 —</h4>
        <p>{siteName}</p>
        <p>覆盖项目征集、投票、报名、成绩录入与审核、积分统计与公开看板</p>
        <h4>— 学校 —</h4>
        <p>{schoolName}</p>
        <h4>— 界面 —</h4>
        <p>
          界面参照{" "}
          <a href={RM_UI_REPO} target="_blank" rel="noreferrer noopener">
            RM Schedule
            <MdiIcon path={MDI.openInNew} size={14} />
            <span className="pt-sr-only">（在新窗口打开）</span>
          </a>
          （华南理工大学华南虎战队，Apache-2.0）
        </p>
      </div>
      <DialogClose onClose={onClose} />
    </DialogFrame>
  );
};
