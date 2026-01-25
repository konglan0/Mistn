// Timeline data configuration file
// Used to manage data for the timeline page

export interface TimelineItem {
	id: string;
	title: string;
	description: string;
	type: "education" | "work" | "project" | "achievement";
	startDate: string;
	endDate?: string; // If empty, it means current
	location?: string;
	organization?: string;
	position?: string;
	skills?: string[];
	achievements?: string[];
	links?: {
		name: string;
		url: string;
		type: "website" | "certificate" | "project" | "other";
	}[];
	icon?: string; // Iconify icon name
	color?: string;
	featured?: boolean;
}

export const timelineData: TimelineItem[] = [
	{
		id: "master-study",
		title: "数学硕士研究生在读",
		description:
			"目前在安徽理工大学攻读数学硕士学位，主攻多模态智能体研究方向。同时致力于解决多模态模型的语言影响视觉偏见问题以及医疗多模态智能体等课题。",
		type: "education",
		startDate: "2025-09-01", // 假设是2025年入学，如果是2024请自行修改
		location: "安徽淮南",
		organization: "安徽理工大学",
		skills: ["Python", "PyTorch", "Multimodal Learning", "Agentic AI", "Deep Learning"],
		achievements: [
			"研究方向：多模态智能体 (Multimodal Agents)",
			"个人课题：多模态模型的语言影响视觉偏见问题研究",
			"个人课题：医疗多模态智能体应用研究",
			"正在深入学习 Agentic AI 相关前沿知识",
		],
		icon: "material-symbols:school",
		color: "#059669",
		featured: true,
	},
	{
		id: "competition-tutor",
		title: "学科竞赛辅导讲师",
		description:
			"担任数学建模竞赛、大数据竞赛、能源经济大赛、统计建模大赛等各类学科竞赛的专业辅导讲师，利用丰富的参赛经验指导学生。",
		type: "work",
		startDate: "2025-02-01", // 具体开始时间可调整
		position: "竞赛辅导讲师",
		skills: ["数学建模", "大数据", "教学指导", "Python"],
		achievements: [
			"辅导多项数学建模竞赛",
			"指导能源经济大赛参赛队伍",
			"教授统计建模核心方法论",
		],
		icon: "material-symbols:supervisor-account",
		color: "#DC2626",
		featured: true,
	},
	{
		id: "poetry-member",
		title: "中华诗词学会会员",
		description:
			"初中自学古典诗词写作，用诗词倾诉心事，于近年成功加入中华诗词学会。",
		type: "achievement",
		startDate: "2024-11-01", // 具体入会时间可调整
		organization: "中华诗词学会",
		achievements: [
			"正式成为中华诗词学会会员",
			"持续进行诗词创作与研习",
		],
		icon: "material-symbols:history-edu", // 使用毛笔/文教图标
		color: "#7C3AED",
		featured: false,
	},
	{
		id: "undergrad-graduation",
		title: "数学与应用数学 本科毕业",
		description:
			"毕业于湖北师范大学，在校期间专注于数学基础理论与应用研究，积累了丰富的竞赛经验。",
		type: "education",
		startDate: "2021-09-01",
		endDate: "2025-08-10",
		location: "湖北黄石",
		organization: "湖北师范大学",
		skills: ["数学分析", "高等代数", "概率论", "数学建模"],
		achievements: [
			"荣获 2024-2025 学年本专科生国家奖学金",
			"本科期间参与数学建模竞赛 20+ 场次",
			"具备扎实的数学理论基础与应用能力",
		],
		icon: "material-symbols:school",
		color: "#2563EB",
		featured: true,
	},
	{
		id: "undergrad-thesis",
		title: "本科毕业设计项目",
		description:
			"基于多尺度自适应注意力机制的时空特征融合模型在高频股指预测中的研究与应用",
		type: "project",
		startDate: "2024-12-01",
		endDate: "2025-05-30",
		skills: ["Deep Learning", "Attention Mechanism", "Time Series Analysis", "Python"],
		achievements: [
			"构建了多尺度自适应注意力机制模型",
			"实现了时空特征的高效融合",
			"成功应用于高频股指预测场景，提升了预测精度",
		],
		icon: "material-symbols:code",
		color: "#EA580C",
		featured: true,
	},
	{
		id: "national-scholarship",
		title: "国家奖学金",
		description:
			"荣获 2023-2024 学年国家奖学金。由中央政府出资设立，全日制本专科学生的最高级别奖学金。",
		type: "achievement",
		startDate: "2023-12-01", // 通常在年底颁发
		endDate: "2024-10-29", // 【关键修改】加上这一行，设为同一天或当月，表示这是一个已完成的事件
		organization: "中华人民共和国教育部",
		achievements: [
			"获得 2024-2025 学年国家奖学金证书",
			"本专科生阶段国家级最高荣誉",
			"表彰在德、智、体、美、劳等方面全面发展的优异表现",
		],
		icon: "material-symbols:workspace-premium", // 使用奖章图标
		color: "#F59E0B", // 使用金色高亮
		featured: true,
	},
    {
		id: "math-modeling-contests",
		title: "数学建模竞赛经历",
		description:
			"在本科期间高强度参与各类数学建模竞赛，积累了深厚的竞赛经验。",
		type: "achievement",
		startDate: "2022-06-01",
		endDate: "2025-5-10",
		organization: "各类数模组委会",
		skills: ["Python", "LaTeX"],
		achievements: [
			"参与竞赛场次超过 20 场",
			"极强的团队协作与短时间抗压能力",
		],
		icon: "material-symbols:emoji-events",
		color: "#F59E0B",
	},
	{
		id: "high-school",
		title: "高中毕业，从地狱逃脱",
		description:
			"就读于毛坦厂中学本部。",
		type: "education",
		startDate: "2018-09-01",
		endDate: "2021-08-10",
		location: "安徽六安",
		organization: "毛坦厂中学",
		icon: "material-symbols:school",
		color: "#64748B",
	},
];

// Get timeline statistics
// 统计时保持原样，包含所有项目（无论是否结束）
export const getTimelineStats = () => {
	const total = timelineData.length;
	const byType = {
		education: timelineData.filter((item) => item.type === "education")
			.length,
		work: timelineData.filter((item) => item.type === "work").length,
		project: timelineData.filter((item) => item.type === "project").length,
		achievement: timelineData.filter((item) => item.type === "achievement")
			.length,
	};

	return { total, byType };
};

// Get timeline items by type (Filtered for History)
// 修改点：默认只返回【已结束】的项目 (即有 endDate 的)，除非你专门想要看 "current"
export const getTimelineByType = (type?: string) => {
	// 基础过滤：排除掉正在进行的项目（没有 endDate 的），只看历史
	// 如果你想让这个函数包含所有项目，请删除 .filter((item) => item.endDate)
	let filteredData = timelineData.filter((item) => item.endDate);

	if (!type || type === "all") {
		return filteredData.sort(
			(a, b) =>
				new Date(b.startDate).getTime() -
				new Date(a.startDate).getTime(),
		);
	}
	
	return filteredData
		.filter((item) => item.type === type)
		.sort(
			(a, b) =>
				new Date(b.startDate).getTime() -
				new Date(a.startDate).getTime(),
		);
};

// Get featured timeline items
// 精选项目通常混合展示，或者你可以根据需求也加上 .filter(item => item.endDate)
export const getFeaturedTimeline = () => {
	return timelineData
		.filter((item) => item.featured)
		.sort(
			(a, b) =>
				new Date(b.startDate).getTime() -
				new Date(a.startDate).getTime(),
		);
};

// Get current ongoing items
// 专门用于获取“当前状态”的函数
export const getCurrentItems = () => {
	return timelineData.filter((item) => !item.endDate);
};

// Calculate total work experience
// 计算工作经验时长（逻辑不变，计算所有 work 类型的时长）
export const getTotalWorkExperience = () => {
	const workItems = timelineData.filter((item) => item.type === "work");
	let totalMonths = 0;

	workItems.forEach((item) => {
		const startDate = new Date(item.startDate);
		// 如果没有结束日期，就计算到今天
		const endDate = item.endDate ? new Date(item.endDate) : new Date();
		const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
		const diffMonths = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 30));
		totalMonths += diffMonths;
	});

	return {
		years: Math.floor(totalMonths / 12),
		months: totalMonths % 12,
	};
};
