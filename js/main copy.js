const width = 960;
const height = 600;

// 画布
const svg = d3.select("#map")
  .append("svg")
  .attr("width", width)
  .attr("height", height);

// 投影
const projection = d3.geoMercator()
  .center([0, 20])
  .scale(150)
  .translate([width / 2, height / 2]);

const path = d3.geoPath().projection(projection);

// 加载世界地图
d3.json("https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson").then(worldData => {
  svg.append("g")
    .selectAll("path")
    .data(worldData.features)
    .enter()
    .append("path")
    .attr("fill", "#e0e0e0")
    .attr("d", path)
    .style("stroke", "#999");

  // 加载公司数据
  // 聚合连接路径
  d3.csv("possessed_data/us_com_city.csv").then(data => {
    // 聚合城市对
    const grouped = d3.rollup(
      data,
      v => v.length,
      d => d.Parent_City_clean + "_" + d.Subsidiary_City_clean
    );

    const links = Array.from(grouped, ([key, count]) => {
      const [pCity, sCity] = key.split("_");
      const example = data.find(d => d.Parent_City_clean === pCity && d.Subsidiary_City_clean === sCity);
      return {
        source: [parseFloat(example.head_lng), parseFloat(example.head_lat)],
        target: [parseFloat(example.sub_lng), parseFloat(example.sub_lat)],
        count: count
      };
    });

    // 绘制弧线
    svg.selectAll("path.arc")
      .data(links)
      .enter()
      .append("path")
      .attr("class", "arc")
      .attr("fill", "none")
      .attr("stroke", "#2196f3")
      .attr("stroke-width", d => Math.sqrt(d.count))
      .attr("d", d => {
        const src = projection(d.source);
        const tgt = projection(d.target);
        const dx = tgt[0] - src[0];
        const dy = tgt[1] - src[1];
        const dr = Math.sqrt(dx * dx + dy * dy) * 1.5;
        return `M${src[0]},${src[1]}A${dr},${dr} 0 0,1 ${tgt[0]},${tgt[1]}`;
      });
  });

});
